-- Sprint 3: leads and messaging.
--
--   * Chat rules: read receipts, rate limits, and a flag on messages that talk about payment.
--   * Calls and WhatsApp: a signed-in buyer reveals the seller's number through contact_seller(),
--     which logs the lead. Leads can no longer be inserted directly, so counts stay honest.
--   * Notifications: per-person settings, a verified email address, and a private outbox
--     (private.deliveries) that a scheduled job drains through the SMS and email providers.
--
-- Throttles that keep SMS useful and affordable:
--   new message   only if still unread after 1 minute; at most one per conversation per 30 minutes
--   every channel at most 12 SMS / 30 emails per person per 24 hours

-- ---------------------------------------------------------------------------
-- Seller contact preferences (public: they decide which buttons a listing shows) and a
-- private, verified email address for notifications.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column accepts_calls boolean not null default true,
  add column accepts_whatsapp boolean not null default true,
  add column email text check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  add column email_verified_at timestamptz;

comment on column public.profiles.email is 'Private: verified notification address. Not granted to the API; see my_settings().';

grant select (accepts_calls, accepts_whatsapp) on public.profiles to anon, authenticated;
grant update (accepts_calls, accepts_whatsapp) on public.profiles to authenticated;

-- The read model gains the seller's contact preferences (appended columns only).
create or replace view public.listing_overview with (security_invoker = true) as
select
  l.id,
  l.status,
  (l.status = 'live' and (l.expires_at is null or l.expires_at > now())) as is_public,
  l.seller_id,
  l.dealer_id,
  l.vehicle_id,
  l.model_id,
  mk.id as make_id,
  mk.name as make_name,
  m.name as model_name,
  l.year,
  concat_ws(' ', l.year::text, mk.name, m.name) as title,
  l.mileage_km,
  l.price_kes,
  l.negotiable,
  l.condition,
  l.body_type,
  l.fuel_type,
  l.transmission,
  l.drivetrain,
  l.engine_cc,
  l.colour,
  l.county_code,
  c.name as county_name,
  l.town,
  l.description,
  l.features,
  cover.storage_path as cover_path,
  cover.thumb_path as cover_thumb_path,
  coalesce(photos.n, 0)::integer as photo_count,
  l.rejection_reason,
  l.published_at,
  l.expires_at,
  l.sold_at,
  l.boosted_until,
  l.featured_until,
  l.created_at,
  l.updated_at,
  p.full_name as seller_name,
  p.created_at as seller_since,
  v.chassis_masked,
  mk.slug as make_slug,
  m.slug as model_slug,
  c.slug as county_slug,
  coalesce(p.accepts_calls, false) as seller_accepts_calls,
  coalesce(p.accepts_whatsapp, false) as seller_accepts_whatsapp
from public.listings l
join public.models m on m.id = l.model_id
join public.makes mk on mk.id = m.make_id
left join public.counties c on c.code = l.county_code
left join public.profiles p on p.id = l.seller_id
left join public.vehicles v on v.id = l.vehicle_id
left join lateral (
  select lm.storage_path, lm.thumb_path from public.listing_media lm
   where lm.listing_id = l.id and lm.kind = 'photo'
   order by lm.position, lm.created_at
   limit 1
) cover on true
left join lateral (
  select count(*) as n from public.listing_media lm where lm.listing_id = l.id and lm.kind = 'photo'
) photos on true;

-- ---------------------------------------------------------------------------
-- Notification settings. No row means the defaults.
-- ---------------------------------------------------------------------------
create type public.alert_frequency as enum ('instant', 'daily', 'off');

create table public.notification_settings (
  profile_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  sms_messages boolean not null default true,
  sms_search_alerts public.alert_frequency not null default 'daily',
  email_messages boolean not null default true,
  email_search_alerts public.alert_frequency not null default 'daily',
  updated_at timestamptz not null default now()
);

create trigger notification_settings_updated_at before update on public.notification_settings
  for each row execute function private.set_updated_at();

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon, authenticated;
grant select on public.notification_settings to authenticated;
grant insert (sms_messages, sms_search_alerts, email_messages, email_search_alerts)
  on public.notification_settings to authenticated;
grant update (sms_messages, sms_search_alerts, email_messages, email_search_alerts)
  on public.notification_settings to authenticated;

create policy "People manage their own settings" on public.notification_settings
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Effective settings for anyone, defaults filled in. Internal.
create or replace function private.settings_for(p_profile uuid)
returns public.notification_settings
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s from public.notification_settings s where s.profile_id = p_profile),
    row(p_profile, true, 'daily', true, 'daily', now())::public.notification_settings
  );
$$;

-- ---------------------------------------------------------------------------
-- Chat rules
-- ---------------------------------------------------------------------------
alter table public.messages add column flags text[] not null default '{}';
comment on column public.messages.flags is 'Set by trigger: "payment" when the text asks about sending money.';

-- Phrases scammers use to take money before a viewing. Kept deliberately narrow: a warning
-- that fires on every message would be ignored.
create or replace function private.mentions_payment(body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select body ~* ('(m-?pesa|paybill|pay bill|till (no|number)|lipa na|airtel money|deposit|booking fee|'
                  || 'viewing fee|reservation fee|holding fee|send (me )?(the )?(money|cash|funds)|'
                  || 'advance payment|pay (first|upfront|up front|before (viewing|you see))|western union|'
                  || 'bank (details|account)|account (no|number))');
$$;

create or replace function private.prepare_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.body := btrim(new.body, E' \t\r\n');
  if new.body = '' then
    raise exception 'Write a message first.' using errcode = '23514';
  end if;
  if (select count(*) from public.messages
       where sender_id = new.sender_id and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'You are sending messages very fast. Wait a few minutes, then try again.' using errcode = '23514';
  end if;
  new.flags := case when private.mentions_payment(new.body) then array['payment'] else '{}' end;
  new.read_at := null;
  return new;
end;
$$;

create trigger messages_prepare before insert on public.messages
  for each row execute function private.prepare_message();

create or replace function private.limit_new_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.conversations
       where buyer_id = new.buyer_id and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'You have contacted many sellers in the last hour. Try again later.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger conversations_limit before insert on public.conversations
  for each row execute function private.limit_new_conversations();

-- A new conversation is a lead for the seller.
create or replace function private.log_chat_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.leads (listing_id, buyer_id, lead_type) values (new.listing_id, new.buyer_id, 'chat');
  return null;
end;
$$;

create trigger conversations_log_lead after insert on public.conversations
  for each row execute function private.log_chat_lead();

-- Mark everything the other person sent as read; returns how many changed.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language sql
set search_path = ''
as $$
  with changed as (
    update public.messages set read_at = now()
     where conversation_id = p_conversation_id
       and sender_id <> (select auth.uid())
       and read_at is null
    returning 1
  )
  select count(*)::integer from changed;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Inbox rows for the signed-in person (or one conversation when an id is given). Security
-- definer so the car's title still shows after it sells; limited to the person's own chats.
create or replace function public.my_conversations(p_id uuid default null)
returns table (
  id uuid,
  listing_id uuid,
  is_buyer boolean,
  other_id uuid,
  other_name text,
  listing_title text,
  listing_price_kes bigint,
  listing_status public.listing_status,
  listing_is_public boolean,
  cover_thumb_path text,
  last_message_at timestamptz,
  last_body text,
  last_from_me boolean,
  unread bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.listing_id, c.buyer_id = me.id,
         case when c.buyer_id = me.id then c.seller_id else c.buyer_id end,
         case when c.buyer_id = me.id then seller.full_name else buyer.full_name end,
         o.title, o.price_kes, o.status, o.is_public, o.cover_thumb_path,
         c.last_message_at, last.body, last.sender_id = me.id,
         (select count(*) from public.messages m
           where m.conversation_id = c.id and m.sender_id <> me.id and m.read_at is null),
         c.created_at
    from (select (select auth.uid()) as id) me
    join public.conversations c on me.id in (c.buyer_id, c.seller_id)
    join public.listing_overview o on o.id = c.listing_id
    left join public.profiles buyer on buyer.id = c.buyer_id
    left join public.profiles seller on seller.id = c.seller_id
    left join lateral (
      select m.body, m.sender_id from public.messages m
       where m.conversation_id = c.id order by m.created_at desc limit 1
    ) last on true
   where p_id is null or c.id = p_id
   order by coalesce(c.last_message_at, c.created_at) desc
   limit 200;
$$;

revoke execute on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Calls and WhatsApp: reveal the seller's number to a signed-in buyer and log the lead.
-- ---------------------------------------------------------------------------
revoke insert on public.leads from anon, authenticated;
drop policy "Anyone logs a lead on a live listing" on public.leads;
create index leads_buyer_idx on public.leads (buyer_id, created_at desc) where buyer_id is not null;

create or replace function public.contact_seller(p_listing_id uuid, p_kind public.lead_type)
returns table (phone text, seller_name text, title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  l record;
begin
  if me is null then
    raise exception 'Sign in to contact sellers.' using errcode = '42501';
  end if;
  if p_kind not in ('call', 'whatsapp') then
    raise exception 'Use the chat to send a message.' using errcode = '22023';
  end if;

  select o.seller_id, o.title, o.is_public, o.seller_accepts_calls, o.seller_accepts_whatsapp,
         p.phone, p.full_name
    into l
    from public.listing_overview o
    join public.profiles p on p.id = o.seller_id
   where o.id = p_listing_id;

  if not found or not l.is_public then
    raise exception 'This car is no longer for sale.' using errcode = '42501';
  end if;
  if l.seller_id = me then
    raise exception 'This is your own listing.' using errcode = '42501';
  end if;
  if (p_kind = 'call' and not l.seller_accepts_calls) or (p_kind = 'whatsapp' and not l.seller_accepts_whatsapp)
     or l.phone is null then
    raise exception 'This seller prefers messages. Use the chat instead.' using errcode = '42501';
  end if;
  -- Harvesting numbers is the main way scammers find victims: cap how many sellers one
  -- account can reveal in a day (repeat taps on the same car don't count).
  if (select count(distinct listing_id) from public.leads
       where buyer_id = me and lead_type in ('call', 'whatsapp') and created_at > now() - interval '24 hours'
         and listing_id <> p_listing_id) >= 30 then
    raise exception 'You have contacted many sellers today. Send a message instead, or try again tomorrow.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.leads
     where buyer_id = me and listing_id = p_listing_id and lead_type = p_kind
       and created_at > now() - interval '24 hours'
  ) then
    insert into public.leads (listing_id, buyer_id, lead_type) values (p_listing_id, me, p_kind);
  end if;

  return query select l.phone, l.full_name, l.title;
end;
$$;

revoke execute on function public.contact_seller(uuid, public.lead_type) from public, anon;
grant execute on function public.contact_seller(uuid, public.lead_type) to authenticated;

-- Lead counts per listing for the seller's dashboard.
create or replace function public.my_lead_counts()
returns table (listing_id uuid, chats bigint, calls bigint, whatsapps bigint, unread_messages bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         (select count(*) from public.leads x where x.listing_id = l.id and x.lead_type = 'chat'),
         (select count(*) from public.leads x where x.listing_id = l.id and x.lead_type = 'call'),
         (select count(*) from public.leads x where x.listing_id = l.id and x.lead_type = 'whatsapp'),
         (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
           where c.listing_id = l.id and c.seller_id = l.seller_id and m.sender_id <> l.seller_id and m.read_at is null)
    from public.listings l
   where l.seller_id = (select auth.uid());
$$;

revoke execute on function public.my_lead_counts() from public, anon;
grant execute on function public.my_lead_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Outbox: one row per SMS or email, drained by the delivery job.
-- ---------------------------------------------------------------------------
create type public.delivery_channel as enum ('sms', 'email');
create type public.delivery_kind as enum ('new_message', 'search_alert', 'search_digest', 'email_verification');
create type public.delivery_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

create table private.deliveries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel public.delivery_channel not null,
  kind public.delivery_kind not null,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  -- Only for email verification (the address isn't verified yet); otherwise looked up at send time.
  to_address text,
  payload jsonb not null default '{}'::jsonb,
  status public.delivery_status not null default 'pending',
  not_before timestamptz not null default now(),
  attempts smallint not null default 0,
  skip_reason text,
  last_error text,
  -- What was actually sent, for support and audit.
  sent_to text,
  body text,
  provider_ref text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index deliveries_due_idx on private.deliveries (not_before) where status = 'pending';
create index deliveries_profile_idx on private.deliveries (profile_id, channel, created_at desc);
create index deliveries_conversation_idx on private.deliveries (conversation_id, profile_id, created_at desc)
  where conversation_id is not null;

alter table private.deliveries enable row level security;
revoke all on private.deliveries from public, anon, authenticated;

-- Queue one delivery, applying the daily cap. Returns the new id, or null when nothing was queued.
create or replace function private.queue_delivery(
  p_profile uuid,
  p_channel public.delivery_channel,
  p_kind public.delivery_kind,
  p_delay interval default '0 seconds',
  p_conversation uuid default null,
  p_message uuid default null,
  p_notification uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_to text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap integer := case p_channel when 'sms' then 12 else 30 end;
  new_id uuid;
begin
  if p_kind <> 'email_verification' and (
    select count(*) from private.deliveries
     where profile_id = p_profile and channel = p_channel
       and status in ('pending', 'sending', 'sent') and created_at > now() - interval '24 hours'
  ) >= cap then
    insert into private.deliveries (profile_id, channel, kind, conversation_id, message_id, notification_id, payload,
                                    status, skip_reason)
    values (p_profile, p_channel, p_kind, p_conversation, p_message, p_notification, p_payload,
            'skipped', 'daily limit reached')
    returning id into new_id;
    return null;
  end if;

  insert into private.deliveries (profile_id, channel, kind, conversation_id, message_id, notification_id, payload,
                                  to_address, not_before)
  values (p_profile, p_channel, p_kind, p_conversation, p_message, p_notification, p_payload, p_to, now() + p_delay)
  returning id into new_id;
  return new_id;
end;
$$;

-- New message: text and/or email the recipient, unless they're likely reading already.
create or replace function private.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  convo public.conversations;
  recipient uuid;
  prefs public.notification_settings;
  who public.profiles;
begin
  select * into convo from public.conversations where id = new.conversation_id;
  recipient := case when new.sender_id = convo.buyer_id then convo.seller_id else convo.buyer_id end;
  prefs := private.settings_for(recipient);
  select * into who from public.profiles where id = recipient;

  if prefs.sms_messages and who.phone is not null and not exists (
    select 1 from private.deliveries
     where conversation_id = convo.id and profile_id = recipient and channel = 'sms' and kind = 'new_message'
       and status in ('pending', 'sending', 'sent') and created_at > now() - interval '30 minutes'
  ) then
    perform private.queue_delivery(recipient, 'sms', 'new_message', '1 minute', convo.id, new.id);
  end if;

  if prefs.email_messages and who.email_verified_at is not null and not exists (
    select 1 from private.deliveries
     where conversation_id = convo.id and profile_id = recipient and channel = 'email' and kind = 'new_message'
       and status in ('pending', 'sending', 'sent') and created_at > now() - interval '30 minutes'
  ) then
    perform private.queue_delivery(recipient, 'email', 'new_message', '1 minute', convo.id, new.id);
  end if;
  return null;
end;
$$;

create trigger messages_notify after insert on public.messages
  for each row execute function private.notify_new_message();

-- Saved-search matches: send now for people who chose "instant"; the rest wait for the digest.
alter table public.notifications add column digested_at timestamptz;

create or replace function private.notify_search_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefs public.notification_settings := private.settings_for(new.profile_id);
  who public.profiles;
begin
  if new.kind <> 'saved_search_match' then
    return null;
  end if;
  select * into who from public.profiles where id = new.profile_id;
  if prefs.sms_search_alerts = 'instant' and who.phone is not null then
    perform private.queue_delivery(new.profile_id, 'sms', 'search_alert', p_notification => new.id);
  end if;
  if prefs.email_search_alerts = 'instant' and who.email_verified_at is not null then
    perform private.queue_delivery(new.profile_id, 'email', 'search_alert', p_notification => new.id);
  end if;
  return null;
end;
$$;

create trigger notifications_notify after insert on public.notifications
  for each row execute function private.notify_search_match();

-- Daily at 08:00 in Kenya: one summary per person who chose "daily" and has unread alerts.
create or replace function public.queue_search_digests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  person record;
  queued integer := 0;
begin
  for person in
    select n.profile_id,
           array_agg(n.id order by n.created_at) as ids,
           private.settings_for(n.profile_id) as prefs,
           p.phone,
           p.email_verified_at
      from public.notifications n
      join public.profiles p on p.id = n.profile_id
     where n.kind = 'saved_search_match' and n.read_at is null and n.digested_at is null
       and n.created_at > now() - interval '48 hours'
     group by n.profile_id, p.phone, p.email_verified_at
  loop
    if (person.prefs).sms_search_alerts = 'daily' and person.phone is not null then
      if private.queue_delivery(person.profile_id, 'sms', 'search_digest',
                                p_payload => jsonb_build_object('notification_ids', to_jsonb(person.ids))) is not null then
        queued := queued + 1;
      end if;
    end if;
    if (person.prefs).email_search_alerts = 'daily' and person.email_verified_at is not null then
      if private.queue_delivery(person.profile_id, 'email', 'search_digest',
                                p_payload => jsonb_build_object('notification_ids', to_jsonb(person.ids))) is not null then
        queued := queued + 1;
      end if;
    end if;
    update public.notifications set digested_at = now() where id = any (person.ids);
  end loop;
  return queued;
end;
$$;

revoke execute on function public.queue_search_digests() from public, anon, authenticated;
grant execute on function public.queue_search_digests() to service_role;

-- What a delivery needs to be written: names, the car, the message excerpt, the searches.
create or replace function private.delivery_context(d private.deliveries)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case d.kind
    when 'new_message' then (
      select jsonb_build_object(
        'conversation_id', c.id,
        'recipient_is_seller', c.seller_id = d.profile_id,
        'sender_name', sender.full_name,
        'listing_title', o.title,
        'excerpt', left(m.body, 200),
        'unread', (select count(*) from public.messages x
                    where x.conversation_id = c.id and x.sender_id <> d.profile_id and x.read_at is null))
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
        join public.listing_overview o on o.id = c.listing_id
        left join public.profiles sender on sender.id = m.sender_id
       where m.id = d.message_id)
    when 'search_alert' then (
      select jsonb_build_object(
        'saved_search_id', n.saved_search_id,
        'search_name', coalesce(s.name, n.payload ->> 'name'),
        'count', (n.payload ->> 'count')::integer,
        'first_title', o.title,
        'first_price_kes', o.price_kes)
        from public.notifications n
        left join public.saved_searches s on s.id = n.saved_search_id
        left join public.listing_overview o on o.id = (n.payload -> 'listing_ids' ->> 0)::uuid
       where n.id = d.notification_id)
    when 'search_digest' then (
      select jsonb_build_object(
        'searches', coalesce(jsonb_agg(jsonb_build_object(
                      'saved_search_id', n.saved_search_id,
                      'name', coalesce(s.name, n.payload ->> 'name'),
                      'count', (n.payload ->> 'count')::integer) order by n.created_at), '[]'::jsonb),
        'total', coalesce(sum((n.payload ->> 'count')::integer), 0))
        from public.notifications n
        left join public.saved_searches s on s.id = n.saved_search_id
       where n.id in (select jsonb_array_elements_text(d.payload -> 'notification_ids')::uuid))
    when 'email_verification' then jsonb_build_object('code', d.payload ->> 'code')
  end;
$$;

-- The delivery job: take up to p_limit due rows (skipping ones that no longer make sense),
-- mark them sending, and return everything needed to write and send them.
create or replace function public.claim_deliveries(p_limit integer default 50)
returns table (
  id uuid,
  channel public.delivery_channel,
  kind public.delivery_kind,
  to_address text,
  recipient_name text,
  context jsonb,
  attempts smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A job that died mid-send leaves rows in "sending": retry them after ten minutes.
  update private.deliveries d set status = 'pending'
   where d.status = 'sending' and d.not_before < now() - interval '10 minutes';

  -- Read in the app while we waited: no need to text.
  update private.deliveries d set status = 'skipped', skip_reason = 'read in the app'
    from public.messages m
   where d.status = 'pending' and d.kind = 'new_message' and m.id = d.message_id and m.read_at is not null;

  -- Settings changed, or the phone or email went away, since it was queued.
  update private.deliveries d set status = 'skipped', skip_reason = 'turned off or no address'
    from public.profiles p
   where d.status = 'pending' and p.id = d.profile_id and d.kind <> 'email_verification'
     and (case d.channel when 'sms' then p.phone is null else p.email_verified_at is null end
          or (d.kind = 'new_message' and not (case d.channel when 'sms' then (private.settings_for(p.id)).sms_messages
                                                             else (private.settings_for(p.id)).email_messages end))
          or (d.kind in ('search_alert', 'search_digest')
              and (case d.channel when 'sms' then (private.settings_for(p.id)).sms_search_alerts
                                  else (private.settings_for(p.id)).email_search_alerts end) = 'off'));

  return query
  with due as (
    select d.id from private.deliveries d
     where d.status = 'pending' and d.not_before <= now()
     order by d.not_before
     limit greatest(1, least(p_limit, 200))
     for update skip locked
  ), claimed as (
    update private.deliveries d
       set status = 'sending', attempts = d.attempts + 1, not_before = now()
      from due where d.id = due.id
    returning d.*
  )
  select c.id, c.channel, c.kind,
         coalesce(c.to_address, case c.channel when 'sms' then p.phone else p.email end),
         p.full_name,
         private.delivery_context(c::private.deliveries),
         c.attempts
    from claimed c
    join public.profiles p on p.id = c.profile_id;
end;
$$;

-- Record the outcome. Failures retry twice, 5 then 10 minutes later.
create or replace function public.finish_delivery(
  p_id uuid,
  p_sent boolean,
  p_sent_to text default null,
  p_body text default null,
  p_provider_ref text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.deliveries d
     set status = case when p_sent then 'sent'::public.delivery_status
                       when d.attempts < 3 then 'pending'::public.delivery_status
                       else 'failed'::public.delivery_status end,
         not_before = case when p_sent then d.not_before else now() + d.attempts * interval '5 minutes' end,
         sent_at = case when p_sent then now() end,
         sent_to = coalesce(p_sent_to, d.sent_to),
         body = case when d.kind = 'email_verification' then '(verification code)' else coalesce(p_body, d.body) end,
         provider_ref = coalesce(p_provider_ref, d.provider_ref),
         last_error = case when p_sent then null else left(p_error, 500) end,
         -- Codes are only needed until the email has gone.
         payload = case when d.kind = 'email_verification' and p_sent then d.payload - 'code' else d.payload end
   where d.id = p_id and d.status = 'sending';
end;
$$;

revoke execute on function public.claim_deliveries(integer) from public, anon, authenticated;
revoke execute on function public.finish_delivery(uuid, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_deliveries(integer) to service_role;
grant execute on function public.finish_delivery(uuid, boolean, text, text, text, text) to service_role;

-- Admins: what went out recently (the "SMS outbox" page; useful before a provider is connected).
create or replace function public.admin_recent_deliveries(p_limit integer default 100)
returns table (
  id uuid,
  created_at timestamptz,
  channel public.delivery_channel,
  kind public.delivery_kind,
  status public.delivery_status,
  recipient_name text,
  sent_to text,
  body text,
  skip_reason text,
  last_error text,
  attempts smallint,
  sent_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  select d.id, d.created_at, d.channel, d.kind, d.status, p.full_name, d.sent_to, d.body, d.skip_reason,
         d.last_error, d.attempts, d.sent_at
    from private.deliveries d
    left join public.profiles p on p.id = d.profile_id
   order by d.created_at desc
   limit least(greatest(p_limit, 1), 500);
end;
$$;

revoke execute on function public.admin_recent_deliveries(integer) from public, anon;
grant execute on function public.admin_recent_deliveries(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Email verification: a 6-digit code sent through the email channel.
-- ---------------------------------------------------------------------------
create table private.email_verifications (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table private.email_verifications enable row level security;
revoke all on private.email_verifications from public, anon, authenticated;

create or replace function private.hash_code(p_profile uuid, p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_profile::text || ':' || p_code, 'UTF8')), 'hex');
$$;

create or replace function public.request_email_verification(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  address text := lower(btrim(p_email));
  code text;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if address !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or char_length(address) > 254 then
    raise exception 'Enter an email address like name@example.com.' using errcode = '22023';
  end if;
  if (select count(*) from private.deliveries
       where profile_id = me and kind = 'email_verification' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many codes requested. Wait an hour, then try again.' using errcode = '23514';
  end if;

  -- 6 digits from the strong random source behind gen_random_uuid().
  code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text,
               6, '0');
  insert into private.email_verifications (profile_id, email, code_hash, attempts, expires_at)
  values (me, address, private.hash_code(me, code), 0, now() + interval '30 minutes')
  on conflict (profile_id) do update
    set email = excluded.email, code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at,
        created_at = now();

  perform private.queue_delivery(me, 'email', 'email_verification', p_payload => jsonb_build_object('code', code),
                                 p_to => address);
end;
$$;

create or replace function public.confirm_email(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pending private.email_verifications;
begin
  select * into pending from private.email_verifications where profile_id = me for update;
  if not found or pending.expires_at < now() then
    raise exception 'That code has expired. Ask for a new one.' using errcode = '22023';
  end if;
  if pending.attempts >= 5 then
    raise exception 'Too many wrong codes. Ask for a new one.' using errcode = '22023';
  end if;
  if pending.code_hash <> private.hash_code(me, btrim(coalesce(p_code, ''))) then
    update private.email_verifications set attempts = attempts + 1 where profile_id = me;
    raise exception 'That code is not right. Check the email and try again.' using errcode = '22023';
  end if;

  update public.profiles set email = pending.email, email_verified_at = now() where id = me;
  delete from private.email_verifications where profile_id = me;
  return pending.email;
end;
$$;

create or replace function public.remove_email()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set email = null, email_verified_at = null where id = (select auth.uid());
  delete from private.email_verifications where profile_id = (select auth.uid());
$$;

-- The signed-in person's notification and contact settings in one call.
create or replace function public.my_settings()
returns table (
  sms_messages boolean,
  sms_search_alerts public.alert_frequency,
  email_messages boolean,
  email_search_alerts public.alert_frequency,
  email text,
  pending_email text,
  accepts_calls boolean,
  accepts_whatsapp boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.sms_messages, s.sms_search_alerts, s.email_messages, s.email_search_alerts,
         case when p.email_verified_at is not null then p.email end,
         (select v.email from private.email_verifications v where v.profile_id = p.id and v.expires_at > now()),
         p.accepts_calls, p.accepts_whatsapp
    from public.profiles p, private.settings_for(p.id) s
   where p.id = (select auth.uid());
$$;

revoke execute on function public.request_email_verification(text) from public, anon;
revoke execute on function public.confirm_email(text) from public, anon;
revoke execute on function public.remove_email() from public, anon;
revoke execute on function public.my_settings() from public, anon;
grant execute on function public.request_email_verification(text) to authenticated;
grant execute on function public.confirm_email(text) to authenticated;
grant execute on function public.remove_email() to authenticated;
grant execute on function public.my_settings() to authenticated;

-- Unread messages for the header badge: only chats the person is in. (Admins can read every
-- chat for moderation, so a plain count over messages would include other people's.)
create or replace function public.my_unread_messages()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
   where (select auth.uid()) in (c.buyer_id, c.seller_id)
     and m.sender_id <> (select auth.uid())
     and m.read_at is null;
$$;

revoke execute on function public.my_unread_messages() from public, anon;
grant execute on function public.my_unread_messages() to authenticated;
