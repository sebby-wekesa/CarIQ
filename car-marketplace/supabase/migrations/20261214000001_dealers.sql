-- Sprint 4: dealers.
--
--   * Registration through apply_dealer(): business details and KRA PIN, then private documents
--     (KRA PIN certificate, business registration, owner's ID). Admins approve or reject.
--   * Trusted dealers: an admin switch that publishes a dealer's cars on submission, unless the
--     Vehicle Passport has an open flag (those still wait for a reviewer).
--   * Staff: invited by phone number with a role; people without an account join automatically
--     the first time they sign in with that number.
--   * Dealer stock is shared: every staff member sees and answers its chats and leads. Buyers see
--     the dealership, not the salesperson.
--   * Views per car, counted once per visitor per day, never counting the seller's own team.
--   * CSV import of many cars at once as drafts with their Passport link.

-- ---------------------------------------------------------------------------
-- Dealer profile and verification
-- ---------------------------------------------------------------------------
alter table public.dealers
  add column opening_hours text check (char_length(opening_hours) <= 120),
  add column accepts_calls boolean not null default true,
  add column accepts_whatsapp boolean not null default true,
  add column trusted boolean not null default false,
  add column rejection_reason text;

comment on column public.dealers.trusted is
  'Set by admins: cars go live on submission unless the Vehicle Passport has an open flag.';

-- Registration goes through apply_dealer() so the slug, owner and KYC row are created together.
revoke insert on public.dealers from authenticated;
grant update (opening_hours, accepts_calls, accepts_whatsapp) on public.dealers to authenticated;

-- Documents move to their own table; the JSON column was never used.
alter table public.dealer_kyc drop column documents;

-- Verified details can only be changed by admins once the dealer is approved.
create or replace function private.guard_dealer_kyc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_privileged() and exists (
    select 1 from public.dealers where id = new.dealer_id and status = 'approved'
  ) then
    raise exception 'Verified details can''t be changed here. Contact support to update them.' using errcode = '42501';
  end if;
  new.kra_pin := upper(btrim(new.kra_pin));
  new.business_reg_no := nullif(upper(btrim(coalesce(new.business_reg_no, ''))), '');
  return new;
end;
$$;

create trigger dealer_kyc_guard before insert or update on public.dealer_kyc
  for each row execute function private.guard_dealer_kyc();

-- Guards call these whoever is acting, including server jobs using the service role.
grant usage on schema private to service_role;
grant execute on function private.is_admin(), private.is_privileged() to service_role;

-- The business name and county are part of what was verified: owners change them through support.
create or replace function private.guard_verified_dealer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_privileged() and old.status = 'approved'
     and (new.name is distinct from old.name or new.county_code is distinct from old.county_code) then
    raise exception 'The business name and county were verified. Contact support to change them.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger dealers_guard_verified before update on public.dealers
  for each row execute function private.guard_verified_dealer();

create type public.dealer_document_kind as enum ('kra_pin_certificate', 'business_registration', 'owner_id', 'business_permit');

create table public.dealer_documents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  kind public.dealer_document_kind not null,
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index dealer_documents_dealer_idx on public.dealer_documents (dealer_id, kind);

alter table public.dealer_documents enable row level security;
revoke all on public.dealer_documents from anon, authenticated;
grant select, delete on public.dealer_documents to authenticated;
grant insert (dealer_id, kind, storage_path, content_type, size_bytes) on public.dealer_documents to authenticated;

create policy "Owners, managers and admins read dealer documents" on public.dealer_documents
  for select to authenticated
  using (private.is_dealer_member(dealer_id, '{owner,manager}') or private.is_admin());

create policy "Owners and managers upload dealer documents" on public.dealer_documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.is_dealer_member(dealer_id, '{owner,manager}')
    and storage_path like dealer_id::text || '/%'
  );

create policy "Owners and managers remove documents before approval" on public.dealer_documents
  for delete to authenticated
  using (
    private.is_dealer_member(dealer_id, '{owner,manager}')
    and exists (select 1 from public.dealers d where d.id = dealer_id and d.status <> 'approved')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('dealer-documents', 'dealer-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create or replace function private.manages_dealer_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dealers d
     where d.id::text = (storage.foldername(p_name))[1]
       and private.is_dealer_member(d.id, '{owner,manager}')
  );
$$;
grant execute on function private.manages_dealer_folder(text) to authenticated;

create policy "Dealer owners and managers manage their document files" on storage.objects
  for all to authenticated
  using (bucket_id = 'dealer-documents' and private.manages_dealer_folder(name))
  with check (bucket_id = 'dealer-documents' and private.manages_dealer_folder(name));

create policy "Admins read dealer document files" on storage.objects
  for select to authenticated
  using (bucket_id = 'dealer-documents' and private.is_admin());

-- Register a dealership: the dealer (pending), its owner and its KYC row in one step.
create or replace function public.apply_dealer(
  p_name text,
  p_county_code integer,
  p_town text,
  p_phone text,
  p_kra_pin text,
  p_business_reg_no text default null,
  p_address text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  base text;
  candidate text;
  n integer := 1;
  new_id uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = me and full_name is not null and county_code is not null) then
    raise exception 'Add your name and county to your profile first.' using errcode = '23514';
  end if;
  if (select count(*) from public.dealers where created_by = me) >= 3 then
    raise exception 'You have already registered three dealerships. Contact support to add more.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Enter the business name.' using errcode = '23514';
  end if;

  base := left(private.slugify(p_name), 60);
  if base = '' then base := 'dealer'; end if;
  candidate := base;
  while exists (select 1 from public.dealers where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;

  insert into public.dealers (name, slug, phone, county_code, town, address, description, created_by)
  values (btrim(p_name), candidate, p_phone, p_county_code, nullif(btrim(coalesce(p_town, '')), ''),
          nullif(btrim(coalesce(p_address, '')), ''), nullif(btrim(coalesce(p_description, '')), ''), me)
  returning id into new_id;

  insert into public.dealer_kyc (dealer_id, kra_pin, business_reg_no) values (new_id, p_kra_pin, p_business_reg_no);
  return new_id;
end;
$$;

revoke execute on function public.apply_dealer(text, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.apply_dealer(text, integer, text, text, text, text, text, text) to authenticated;

-- A rejected dealer fixes what was asked and sends it back.
create or replace function public.resubmit_dealer(p_dealer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_dealer_member(p_dealer_id, '{owner,manager}') then
    raise exception 'Only owners and managers can do this.' using errcode = '42501';
  end if;
  update public.dealers set status = 'pending' where id = p_dealer_id and status = 'rejected';
  if not found then
    raise exception 'This dealership is not waiting for changes.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.resubmit_dealer(uuid) from public, anon;
grant execute on function public.resubmit_dealer(uuid) to authenticated;

-- What a dealer still has to send before review.
create or replace function private.missing_dealer_documents(p_dealer_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(k.kind::text order by k.kind), '{}')
    from unnest(array['kra_pin_certificate', 'business_registration', 'owner_id']::public.dealer_document_kind[]) k(kind)
   where not exists (select 1 from public.dealer_documents d where d.dealer_id = p_dealer_id and d.kind = k.kind);
$$;

-- Admins approve (optionally as trusted) or reject with a reason; the owner gets an SMS.
create or replace function public.admin_review_dealer(
  p_dealer_id uuid,
  p_decision text,
  p_reason text default null,
  p_trusted boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  missing text[];
  dealer public.dealers;
begin
  if not private.is_admin() then
    raise exception 'Only admins can review dealers' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;
  if p_decision = 'reject' and reason is null then
    raise exception 'Give a reason so the dealer knows what to fix' using errcode = '22023';
  end if;
  missing := private.missing_dealer_documents(p_dealer_id);
  if p_decision = 'approve' and cardinality(missing) > 0 then
    raise exception 'Documents missing: %', array_to_string(missing, ', ') using errcode = '23514';
  end if;

  update public.dealers
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.dealer_status,
         verified_at = case when p_decision = 'approve' then now() end,
         trusted = case when p_decision = 'approve' then p_trusted else false end,
         rejection_reason = case when p_decision = 'reject' then reason end
   where id = p_dealer_id and status = 'pending'
  returning * into dealer;
  if not found then
    raise exception 'This dealership is not waiting for review' using errcode = 'P0002';
  end if;

  update public.dealer_kyc
     set reviewed_at = now(), reviewed_by = (select auth.uid()), review_notes = reason
   where dealer_id = p_dealer_id;

  insert into public.audit_log (actor_id, action, target_type, target_id, data)
  values ((select auth.uid()), 'dealer.' || p_decision, 'dealer', p_dealer_id,
          jsonb_build_object('reason', reason, 'trusted', p_trusted));

  perform private.queue_delivery(dealer.created_by, 'sms', 'dealer_status',
    p_payload => jsonb_build_object('dealer_name', dealer.name, 'status', dealer.status, 'reason', reason));
end;
$$;

create or replace function public.admin_set_dealer_trust(p_dealer_id uuid, p_trusted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can change this' using errcode = '42501';
  end if;
  update public.dealers set trusted = p_trusted where id = p_dealer_id and status = 'approved';
  if not found then
    raise exception 'Only approved dealers can be trusted' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, data)
  values ((select auth.uid()), 'dealer.trust', 'dealer', p_dealer_id, jsonb_build_object('trusted', p_trusted));
end;
$$;

revoke execute on function public.admin_review_dealer(uuid, text, text, boolean) from public, anon;
revoke execute on function public.admin_set_dealer_trust(uuid, boolean) from public, anon;
grant execute on function public.admin_review_dealer(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_set_dealer_trust(uuid, boolean) to authenticated;

-- Admin review queue: applications with their KYC, owner and what's still missing.
create or replace function public.admin_dealer_applications()
returns table (
  id uuid,
  name text,
  slug text,
  status public.dealer_status,
  trusted boolean,
  county_name text,
  town text,
  phone text,
  owner_name text,
  owner_phone text,
  kra_pin text,
  business_reg_no text,
  missing_documents text[],
  rejection_reason text,
  created_at timestamptz,
  live_listings bigint
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
  select d.id, d.name, d.slug, d.status, d.trusted, c.name, d.town, d.phone, p.full_name, p.phone,
         k.kra_pin, k.business_reg_no, private.missing_dealer_documents(d.id), d.rejection_reason, d.created_at,
         (select count(*) from public.listings l where l.dealer_id = d.id and l.status = 'live')
    from public.dealers d
    left join public.counties c on c.code = d.county_code
    left join public.profiles p on p.id = d.created_by
    left join public.dealer_kyc k on k.dealer_id = d.id
   order by (d.status = 'pending') desc, d.created_at;
end;
$$;

revoke execute on function public.admin_dealer_applications() from public, anon;
grant execute on function public.admin_dealer_applications() to authenticated;

-- ---------------------------------------------------------------------------
-- Staff invites
-- ---------------------------------------------------------------------------
-- People join a team only through invite_dealer_staff() (which texts them) or by accepting an
-- invite; owners can change roles but not swap who a membership belongs to.
revoke insert, update on public.dealer_members from authenticated;
grant update (role) on public.dealer_members to authenticated;

create table public.dealer_invites (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  phone text not null check (phone ~ '^\+254[17][0-9]{8}$'),
  role public.dealer_role not null check (role <> 'owner'),
  invited_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);
create unique index dealer_invites_pending_idx on public.dealer_invites (dealer_id, phone) where accepted_at is null;
create index dealer_invites_phone_idx on public.dealer_invites (phone) where accepted_at is null;

alter table public.dealer_invites enable row level security;
revoke all on public.dealer_invites from anon, authenticated;
grant select, delete on public.dealer_invites to authenticated;

create policy "Owners and managers see invites" on public.dealer_invites
  for select to authenticated
  using (private.is_dealer_member(dealer_id, '{owner,manager}'));

create policy "Owners and managers cancel invites" on public.dealer_invites
  for delete to authenticated
  using (accepted_at is null and private.is_dealer_member(dealer_id, '{owner,manager}'));

-- Add someone to the team by phone number. Owners can add managers and sales staff; managers
-- can add sales staff. Returns 'added' (they already have an account) or 'invited'.
create or replace function public.invite_dealer_staff(p_dealer_id uuid, p_phone text, p_role public.dealer_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  dealer public.dealers;
  existing uuid;
  inviter text;
begin
  if p_role = 'owner' then
    raise exception 'Owners are added by changing an existing member''s role.' using errcode = '22023';
  end if;
  if not (private.is_dealer_member(p_dealer_id, '{owner}')
          or (p_role = 'sales' and private.is_dealer_member(p_dealer_id, '{manager}'))) then
    raise exception 'You can''t add people with that role.' using errcode = '42501';
  end if;
  if p_phone !~ '^\+254[17][0-9]{8}$' then
    raise exception 'Enter a Kenyan mobile number.' using errcode = '22023';
  end if;
  if (select count(*) from public.dealer_members where dealer_id = p_dealer_id)
     + (select count(*) from public.dealer_invites where dealer_id = p_dealer_id and accepted_at is null) >= 25 then
    raise exception 'A team can have up to 25 people. Contact support for more.' using errcode = '23514';
  end if;
  if (select count(*) from public.dealer_invites where dealer_id = p_dealer_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many invites today. Try again tomorrow.' using errcode = '23514';
  end if;

  select * into dealer from public.dealers where id = p_dealer_id;
  select full_name into inviter from public.profiles where id = me;
  select id into existing from public.profiles where phone = p_phone;

  if existing is not null then
    if exists (select 1 from public.dealer_members where dealer_id = p_dealer_id and profile_id = existing) then
      raise exception 'That person is already on the team.' using errcode = '23505';
    end if;
    insert into public.dealer_members (dealer_id, profile_id, role) values (p_dealer_id, existing, p_role);
    perform private.queue_delivery(existing, 'sms', 'dealer_invite',
      p_payload => jsonb_build_object('dealer_name', dealer.name, 'role', p_role, 'inviter_name', inviter));
    return 'added';
  end if;

  insert into public.dealer_invites (dealer_id, phone, role, invited_by)
  values (p_dealer_id, p_phone, p_role, me)
  on conflict (dealer_id, phone) where accepted_at is null do update set role = excluded.role, invited_by = excluded.invited_by;
  perform private.queue_delivery(null, 'sms', 'dealer_invite', p_to => p_phone,
    p_payload => jsonb_build_object('dealer_name', dealer.name, 'role', p_role, 'inviter_name', inviter));
  return 'invited';
end;
$$;

revoke execute on function public.invite_dealer_staff(uuid, text, public.dealer_role) from public, anon;
grant execute on function public.invite_dealer_staff(uuid, text, public.dealer_role) to authenticated;

-- First sign-in with an invited number: join the team(s) that invited it.
create or replace function private.accept_dealer_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null then
    return null;
  end if;
  insert into public.dealer_members (dealer_id, profile_id, role)
  select i.dealer_id, new.id, i.role from public.dealer_invites i where i.phone = new.phone and i.accepted_at is null
  on conflict do nothing;
  update public.dealer_invites set accepted_at = now(), accepted_by = new.id
   where phone = new.phone and accepted_at is null;
  return null;
end;
$$;

create trigger profiles_accept_dealer_invites after insert on public.profiles
  for each row execute function private.accept_dealer_invites();

-- The team page: members (names, roles, masked numbers) and pending invites.
create or replace function public.dealer_team(p_dealer_id uuid)
returns table (
  profile_id uuid,
  invite_id uuid,
  full_name text,
  phone text,
  role public.dealer_role,
  since timestamptz,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_dealer_member(p_dealer_id) then
    raise exception 'Not a member of this dealership' using errcode = '42501';
  end if;
  return query
  select m.profile_id, null::uuid, p.full_name,
         case when p.phone is null then null
              else left(p.phone, 6) || ' ••• ' || right(p.phone, 3) end,
         m.role, m.created_at, m.profile_id = (select auth.uid())
    from public.dealer_members m
    join public.profiles p on p.id = m.profile_id
   where m.dealer_id = p_dealer_id
  union all
  select null::uuid, i.id, null::text, i.phone, i.role, i.created_at, false
    from public.dealer_invites i
   where i.dealer_id = p_dealer_id and i.accepted_at is null
     and private.is_dealer_member(p_dealer_id, '{owner,manager}')
   order by 6;
end;
$$;

revoke execute on function public.dealer_team(uuid) from public, anon;
grant execute on function public.dealer_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The outbox can now text people who don't have an account yet (staff invites).
-- ---------------------------------------------------------------------------
alter table private.deliveries alter column profile_id drop not null;
alter table private.deliveries add constraint deliveries_has_recipient check (profile_id is not null or to_address is not null);

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
        'recipient_is_seller', c.buyer_id <> d.profile_id,
        'sender_name', case when l.dealer_id is not null and m.sender_id <> c.buyer_id then dl.name else sender.full_name end,
        'sender_is_dealer', l.dealer_id is not null and m.sender_id <> c.buyer_id,
        'listing_title', o.title,
        'excerpt', left(m.body, 200),
        'unread', (select count(*) from public.messages x
                    where x.conversation_id = c.id and x.read_at is null
                      and case when c.buyer_id = d.profile_id then x.sender_id <> c.buyer_id
                               else x.sender_id = c.buyer_id end))
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
        join public.listings l on l.id = c.listing_id
        left join public.dealers dl on dl.id = l.dealer_id
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
    else d.payload
  end;
$$;

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
  update private.deliveries d set status = 'pending'
   where d.status = 'sending' and d.not_before < now() - interval '10 minutes';

  update private.deliveries d set status = 'skipped', skip_reason = 'read in the app'
    from public.messages m
   where d.status = 'pending' and d.kind = 'new_message' and m.id = d.message_id and m.read_at is not null;

  update private.deliveries d set status = 'skipped', skip_reason = 'turned off or no address'
    from public.profiles p
   where d.status = 'pending' and p.id = d.profile_id and d.to_address is null
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
    left join public.profiles p on p.id = c.profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dealer stock in the read model: name, page and badge; dealer contact preferences.
-- ---------------------------------------------------------------------------
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
  case when dl.id is not null then dl.accepts_calls and dl.phone is not null
       else coalesce(p.accepts_calls, false) end as seller_accepts_calls,
  case when dl.id is not null then dl.accepts_whatsapp and dl.phone is not null
       else coalesce(p.accepts_whatsapp, false) end as seller_accepts_whatsapp,
  dl.name as dealer_name,
  dl.slug as dealer_slug,
  coalesce(dl.status = 'approved', false) as dealer_verified
from public.listings l
join public.models m on m.id = l.model_id
join public.makes mk on mk.id = m.make_id
left join public.counties c on c.code = l.county_code
left join public.profiles p on p.id = l.seller_id
left join public.vehicles v on v.id = l.vehicle_id
-- Row-level security on dealers applies: visitors see approved dealers, staff see their own.
left join public.dealers dl on dl.id = l.dealer_id
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
-- Shared dealer inbox: every staff member sees and answers chats about the dealer's cars.
-- "Seller side" = the listing's seller and the dealer's staff; "buyer side" = the buyer.
-- ---------------------------------------------------------------------------
create or replace function private.on_seller_side(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
      join public.listings l on l.id = c.listing_id
     where c.id = p_conversation_id
       and (c.seller_id = (select auth.uid())
            or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
  );
$$;
grant execute on function private.on_seller_side(uuid) to authenticated;

-- Staff can't open a buyer chat about their own dealership's car.
create or replace function private.prepare_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = new.listing_id;
  if l.seller_id is null or l.status <> 'live' then
    raise exception 'You can only message sellers about live listings' using errcode = '42501';
  end if;
  if new.buyer_id = l.seller_id or (l.dealer_id is not null and exists (
       select 1 from public.dealer_members where dealer_id = l.dealer_id and profile_id = new.buyer_id)) then
    raise exception 'You cannot message yourself about your own listing' using errcode = '42501';
  end if;
  new.seller_id := l.seller_id;
  return new;
end;
$$;

drop policy "Participants see conversations" on public.conversations;
create policy "Participants and dealer staff see conversations" on public.conversations
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or private.on_seller_side(id)
    or private.is_admin()
  );

drop policy "Participants send messages" on public.messages;
create policy "Participants and dealer staff send messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.buyer_id = (select auth.uid()) or private.on_seller_side(c.id))
    )
  );

drop policy "Recipients mark messages read" on public.messages;
create policy "Recipients mark messages read" on public.messages
  for update to authenticated
  using (
    exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and ((c.buyer_id = (select auth.uid()) and sender_id <> c.buyer_id)
              or (private.on_seller_side(c.id) and sender_id = c.buyer_id))
    )
  )
  with check (sender_id <> (select auth.uid()));

-- Mark the other side's messages read (for dealer staff: the buyer's messages).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language sql
set search_path = ''
as $$
  with changed as (
    update public.messages m set read_at = now()
      from public.conversations c
     where c.id = p_conversation_id and m.conversation_id = c.id and m.read_at is null
       and case when c.buyer_id = (select auth.uid()) then m.sender_id <> c.buyer_id
                else m.sender_id = c.buyer_id end
    returning 1
  )
  select count(*)::integer from changed;
$$;

-- last_from_me now means "from my side": a colleague's reply counts as answered.
drop function public.my_conversations(uuid);
create or replace function public.my_conversations(p_id uuid default null)
returns table (
  id uuid,
  listing_id uuid,
  is_buyer boolean,
  buyer_id uuid,
  other_id uuid,
  other_name text,
  dealer_name text,
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
  select c.id, c.listing_id, c.buyer_id = me.id, c.buyer_id,
         case when c.buyer_id = me.id then c.seller_id else c.buyer_id end,
         case when c.buyer_id = me.id then coalesce(d.name, seller.full_name) else buyer.full_name end,
         d.name,
         o.title, o.price_kes, o.status, o.is_public, o.cover_thumb_path,
         c.last_message_at, last.body,
         case when c.buyer_id = me.id then last.sender_id = c.buyer_id else last.sender_id <> c.buyer_id end,
         (select count(*) from public.messages m
           where m.conversation_id = c.id and m.read_at is null
             and case when c.buyer_id = me.id then m.sender_id <> c.buyer_id else m.sender_id = c.buyer_id end),
         c.created_at
    from (select (select auth.uid()) as id) me
    join public.conversations c on true
    join public.listings l on l.id = c.listing_id
    left join public.dealers d on d.id = l.dealer_id
    join public.listing_overview o on o.id = c.listing_id
    left join public.profiles buyer on buyer.id = c.buyer_id
    left join public.profiles seller on seller.id = c.seller_id
    left join lateral (
      select m.body, m.sender_id from public.messages m
       where m.conversation_id = c.id order by m.created_at desc limit 1
    ) last on true
   where (me.id in (c.buyer_id, c.seller_id)
          or l.dealer_id in (select dm.dealer_id from public.dealer_members dm where dm.profile_id = me.id))
     and (p_id is null or c.id = p_id)
   order by coalesce(c.last_message_at, c.created_at) desc
   limit 200;
$$;

revoke execute on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated;

create or replace function public.my_unread_messages()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(unread), 0)::integer from public.my_conversations();
$$;

-- Dealer cars: the buyer reaches the dealership's number, and sees the dealership's name.
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

  select o.seller_id, o.dealer_id, o.title, o.is_public, o.seller_accepts_calls, o.seller_accepts_whatsapp,
         coalesce(d.phone, p.phone) as phone, coalesce(d.name, p.full_name) as name
    into l
    from public.listing_overview o
    join public.profiles p on p.id = o.seller_id
    left join public.dealers d on d.id = o.dealer_id
   where o.id = p_listing_id;

  if not found or not l.is_public then
    raise exception 'This car is no longer for sale.' using errcode = '42501';
  end if;
  if l.seller_id = me or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)) then
    raise exception 'This is your own listing.' using errcode = '42501';
  end if;
  if (p_kind = 'call' and not l.seller_accepts_calls) or (p_kind = 'whatsapp' and not l.seller_accepts_whatsapp)
     or l.phone is null then
    raise exception 'This seller prefers messages. Use the chat instead.' using errcode = '42501';
  end if;
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

  return query select l.phone, l.name, l.title;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views per car: once per visitor per day, never the seller's own team. The web app hashes the
-- visitor (IP, browser, day, a server secret) and calls this with the service role.
-- ---------------------------------------------------------------------------
create table public.listing_daily_views (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  primary key (listing_id, day)
);
alter table public.listing_daily_views enable row level security;
revoke all on public.listing_daily_views from anon, authenticated;
grant select on public.listing_daily_views to authenticated;

create policy "Sellers and dealer staff see their views" on public.listing_daily_views
  for select to authenticated
  using (exists (
    select 1 from public.listings l
     where l.id = listing_id
       and (l.seller_id = (select auth.uid()) or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
  ));

create table private.listing_view_seen (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day date not null,
  visitor text not null,
  primary key (listing_id, day, visitor)
);
alter table private.listing_view_seen enable row level security;
revoke all on private.listing_view_seen from public, anon, authenticated;

create or replace function public.record_listing_view(p_listing_id uuid, p_visitor text, p_viewer uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  select * into l from public.listings where id = p_listing_id;
  if not found or l.status <> 'live' or char_length(coalesce(p_visitor, '')) not between 16 and 128 then
    return false;
  end if;
  if p_viewer is not null and (p_viewer = l.seller_id or (l.dealer_id is not null and exists (
       select 1 from public.dealer_members where dealer_id = l.dealer_id and profile_id = p_viewer))) then
    return false;
  end if;

  insert into private.listing_view_seen (listing_id, day, visitor) values (p_listing_id, today, p_visitor)
  on conflict do nothing;
  if not found then
    return false;
  end if;

  insert into public.listing_daily_views (listing_id, day, views) values (p_listing_id, today, 1)
  on conflict (listing_id, day) do update set views = public.listing_daily_views.views + 1;
  update public.listings set view_count = view_count + 1 where id = p_listing_id;

  -- Yesterday's visitor hashes are no longer needed.
  if random() < 0.01 then
    delete from private.listing_view_seen where day < today - 1;
  end if;
  return true;
end;
$$;

-- Counting a view isn't an edit: "last updated" stays the seller's last real change.
drop trigger listings_updated_at on public.listings;
create trigger listings_updated_at before update on public.listings
  for each row when (old.view_count is not distinct from new.view_count)
  execute function private.set_updated_at();

revoke execute on function public.record_listing_view(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_listing_view(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Trusted dealers: a submitted car goes live straight away, unless its Passport has an open
-- flag (the reading was just recorded by listings_record_reading, which fires first).
-- ---------------------------------------------------------------------------
create or replace function private.publish_trusted_dealer_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_review' and old.status is distinct from 'pending_review' and new.dealer_id is not null
     and exists (select 1 from public.dealers where id = new.dealer_id and status = 'approved' and trusted)
     and not exists (select 1 from public.vehicle_flags where vehicle_id = new.vehicle_id and status = 'open') then
    update public.listings set status = 'live' where id = new.id and status = 'pending_review';
    insert into public.audit_log (actor_id, action, target_type, target_id, data)
    values ((select auth.uid()), 'listing.auto_publish', 'listing', new.id, jsonb_build_object('dealer_id', new.dealer_id));
  end if;
  return null;
end;
$$;

create trigger listings_trusted_publish after update of status on public.listings
  for each row execute function private.publish_trusted_dealer_listing();

-- ---------------------------------------------------------------------------
-- Starting a listing for a dealer, and importing many at once.
-- ---------------------------------------------------------------------------
drop function public.start_listing(integer, integer, text);
create or replace function public.start_listing(p_model_id integer, p_year integer, p_chassis text, p_dealer_id uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
  default_body public.body_type;
  default_county smallint;
begin
  select body_type into default_body from public.models where id = p_model_id;
  if p_dealer_id is not null then
    select county_code into default_county from public.dealers where id = p_dealer_id;
  else
    select county_code into default_county from public.profiles where id = (select auth.uid());
  end if;

  insert into public.listings (model_id, year, body_type, county_code, status, dealer_id)
  values (p_model_id, p_year, default_body, default_county, 'draft', p_dealer_id)
  returning id into new_id;

  insert into public.listing_identity (listing_id, chassis_number) values (new_id, p_chassis);
  return new_id;
end;
$$;

revoke execute on function public.start_listing(integer, integer, text, uuid) from public, anon;
grant execute on function public.start_listing(integer, integer, text, uuid) to authenticated;

-- Import up to 200 cars as drafts. Each row stands alone: a bad row is reported and skipped.
-- Runs with the caller's rights, so the usual listing rules and row-level security apply.
create or replace function public.import_dealer_stock(p_dealer_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
  results jsonb := '[]'::jsonb;
  new_id uuid;
  message text;
begin
  if not private.is_dealer_member(p_dealer_id) then
    raise exception 'You are not on this dealership''s team.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No cars to import.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'Import up to 200 cars at a time.' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      insert into public.listings (dealer_id, model_id, year, mileage_km, price_kes, negotiable, condition, body_type,
                                   fuel_type, transmission, drivetrain, engine_cc, colour, county_code, town,
                                   description, features, status)
      values (p_dealer_id, (r ->> 'model_id')::integer, (r ->> 'year')::smallint, (r ->> 'mileage_km')::integer,
              (r ->> 'price_kes')::bigint, coalesce((r ->> 'negotiable')::boolean, true),
              (r ->> 'condition')::public.vehicle_condition, (r ->> 'body_type')::public.body_type,
              (r ->> 'fuel_type')::public.fuel_type, (r ->> 'transmission')::public.transmission,
              (r ->> 'drivetrain')::public.drivetrain, (r ->> 'engine_cc')::integer, r ->> 'colour',
              coalesce((r ->> 'county_code')::smallint, (select county_code from public.dealers where id = p_dealer_id)),
              r ->> 'town', r ->> 'description',
              coalesce(array(select jsonb_array_elements_text(r -> 'features')), '{}'), 'draft')
      returning id into new_id;
      insert into public.listing_identity (listing_id, chassis_number, registration_number)
      values (new_id, r ->> 'chassis', nullif(r ->> 'registration_number', ''));
      results := results || jsonb_build_object('row', r -> 'row', 'ok', true, 'listing_id', new_id);
    exception when others then
      get stacked diagnostics message = message_text;
      results := results || jsonb_build_object('row', r -> 'row', 'ok', false, 'error', message);
    end;
  end loop;
  return results;
end;
$$;

revoke execute on function public.import_dealer_stock(uuid, jsonb) from public, anon;
grant execute on function public.import_dealer_stock(uuid, jsonb) to authenticated;

-- Submit every draft that has what review needs; returns how many went where.
create or replace function public.submit_ready_dealer_stock(p_dealer_id uuid)
returns table (submitted integer, published integer, not_ready integer)
language plpgsql
set search_path = ''
as $$
declare
  draft record;
  ok integer := 0;
  skipped integer := 0;
  ids uuid[] := '{}';
begin
  if not private.is_dealer_member(p_dealer_id) then
    raise exception 'You are not on this dealership''s team.' using errcode = '42501';
  end if;
  for draft in select id from public.listings where dealer_id = p_dealer_id and status = 'draft' order by created_at loop
    begin
      update public.listings set status = 'pending_review' where id = draft.id;
      ok := ok + 1;
      ids := ids || draft.id;
    exception when sqlstate '23514' or sqlstate '23505' then
      -- Not ready yet, or the same car is already listed.
      skipped := skipped + 1;
    end;
  end loop;
  return query select ok, (select count(*)::integer from public.listings where id = any (ids) and status = 'live'), skipped;
end;
$$;

revoke execute on function public.submit_ready_dealer_stock(uuid) from public, anon;
grant execute on function public.submit_ready_dealer_stock(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dealer dashboard
-- ---------------------------------------------------------------------------
-- Every car with views, leads and what it still needs.
create or replace function public.dealer_stock(p_dealer_id uuid)
returns table (
  listing_id uuid,
  title text,
  status public.listing_status,
  price_kes bigint,
  mileage_km integer,
  cover_thumb_path text,
  photo_count integer,
  chassis_number text,
  listed_by text,
  views_total integer,
  views_7d bigint,
  chats bigint,
  calls bigint,
  whatsapps bigint,
  unread_messages bigint,
  missing text[],
  updated_at timestamptz,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_dealer_member(p_dealer_id) then
    raise exception 'Not a member of this dealership' using errcode = '42501';
  end if;
  return query
  select o.id, o.title, o.status, o.price_kes, o.mileage_km, o.cover_thumb_path, o.photo_count, i.chassis_number,
         p.full_name, l.view_count,
         (select coalesce(sum(v.views), 0) from public.listing_daily_views v
           where v.listing_id = o.id and v.day > (now() at time zone 'Africa/Nairobi')::date - 7),
         (select count(*) from public.leads x where x.listing_id = o.id and x.lead_type = 'chat'),
         (select count(*) from public.leads x where x.listing_id = o.id and x.lead_type = 'call'),
         (select count(*) from public.leads x where x.listing_id = o.id and x.lead_type = 'whatsapp'),
         (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
           where c.listing_id = o.id and m.sender_id = c.buyer_id and m.read_at is null),
         array_remove(array[
           case when o.vehicle_id is null then 'chassis number' end,
           case when o.photo_count < 3 then 'photos (' || o.photo_count || ' of 3)' end,
           case when not exists (select 1 from public.vehicle_documents dd where dd.listing_id = o.id and dd.kind = 'odometer_photo')
                then 'dashboard photo' end,
           case when o.price_kes is null or o.mileage_km is null or o.condition is null or o.fuel_type is null
                     or o.transmission is null or o.body_type is null then 'details' end
         ], null),
         o.updated_at, o.published_at
    from public.listing_overview o
    join public.listings l on l.id = o.id
    left join public.listing_identity i on i.listing_id = o.id
    left join public.profiles p on p.id = o.seller_id
   where o.dealer_id = p_dealer_id
   order by o.updated_at desc;
end;
$$;

revoke execute on function public.dealer_stock(uuid) from public, anon;
grant execute on function public.dealer_stock(uuid) to authenticated;

-- The lead inbox: who got in touch about which car, newest first.
create or replace function public.dealer_leads(p_dealer_id uuid, p_limit integer default 200)
returns table (
  created_at timestamptz,
  lead_type public.lead_type,
  listing_id uuid,
  listing_title text,
  buyer_name text,
  conversation_id uuid,
  unread bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_dealer_member(p_dealer_id) then
    raise exception 'Not a member of this dealership' using errcode = '42501';
  end if;
  return query
  select x.created_at, x.lead_type, x.listing_id, o.title, b.full_name, c.id,
         (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id = c.buyer_id and m.read_at is null)
    from public.leads x
    join public.listings l on l.id = x.listing_id
    join public.listing_overview o on o.id = x.listing_id
    left join public.profiles b on b.id = x.buyer_id
    left join public.conversations c on x.lead_type = 'chat' and c.listing_id = x.listing_id and c.buyer_id = x.buyer_id
   where l.dealer_id = p_dealer_id
   order by x.created_at desc
   limit least(greatest(p_limit, 1), 500);
end;
$$;

revoke execute on function public.dealer_leads(uuid, integer) from public, anon;
grant execute on function public.dealer_leads(uuid, integer) to authenticated;

-- The dealerships the signed-in person belongs to, with their role.
create or replace function public.my_dealers()
returns table (id uuid, name text, slug text, status public.dealer_status, trusted boolean, role public.dealer_role,
               rejection_reason text, missing_documents text[])
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.slug, d.status, d.trusted, m.role, d.rejection_reason,
         case when m.role in ('owner', 'manager') then private.missing_dealer_documents(d.id) else '{}' end
    from public.dealer_members m
    join public.dealers d on d.id = m.dealer_id
   where m.profile_id = (select auth.uid())
   order by m.created_at;
$$;

revoke execute on function public.my_dealers() from public, anon;
grant execute on function public.my_dealers() to authenticated;
