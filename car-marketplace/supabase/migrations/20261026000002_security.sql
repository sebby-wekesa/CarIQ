-- =============================================================================
-- Security: helper functions, column grants, row-level security, guard triggers.
--
-- Model
--   * Grant the exact Data API privileges this app needs. New Supabase projects
--     may not auto-expose new public tables, so do not rely on project defaults.
--     For tables with private columns we revoke and re-grant column by column,
--     so a column that is not granted can never be read or written via the API.
--   * Row access is then decided by RLS policies.
--   * Anything privileged (payments, boosts, moderation outcomes, subscriptions)
--     is written server-side with the service role, which bypasses RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function private.is_dealer_member(
  p_dealer_id uuid,
  p_roles public.dealer_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dealer_members
     where dealer_id = p_dealer_id
       and profile_id = (select auth.uid())
       and (p_roles is null or role = any (p_roles))
  );
$$;

-- True for the service role, migrations, and admins. Security invoker on purpose:
-- it must see the role of the caller, not the function owner.
create or replace function private.is_privileged()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated') or private.is_admin();
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.is_dealer_member(uuid, public.dealer_role[]) to anon, authenticated;
grant execute on function private.is_privileged() to anon, authenticated;

-- Callable from the app as an RPC.
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_admin();
$$;
revoke execute on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.counties enable row level security;
alter table public.makes enable row level security;
alter table public.models enable row level security;
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.dealers enable row level security;
alter table public.dealer_kyc enable row level security;
alter table public.dealer_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.listings enable row level security;
alter table public.listing_media enable row level security;
alter table public.favourites enable row level security;
alter table public.saved_searches enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.leads enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;
alter table public.deals enable row level security;
alter table public.inspections enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data: read-only for everyone
-- ---------------------------------------------------------------------------
grant select on public.counties, public.makes, public.models, public.plans
  to anon, authenticated, service_role;

revoke insert, update, delete, truncate on public.counties, public.makes, public.models, public.plans
  from anon, authenticated;

create policy "Counties are public" on public.counties for select to anon, authenticated using (true);
create policy "Makes are public" on public.makes for select to anon, authenticated using (true);
create policy "Models are public" on public.models for select to anon, authenticated using (true);
create policy "Active plans are public" on public.plans for select to anon, authenticated using (is_active);

-- ---------------------------------------------------------------------------
-- Profiles: names are public, phone and role are not
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select (id, full_name, county_code, avatar_url, created_at) on public.profiles to anon, authenticated;
grant update (full_name, county_code, avatar_url) on public.profiles to authenticated;

create policy "Public profile fields are readable" on public.profiles
  for select to anon, authenticated using (true);

create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Dealers
-- ---------------------------------------------------------------------------
revoke all on public.dealers from anon, authenticated;
grant select on public.dealers to anon, authenticated;
grant insert (name, slug, phone, county_code, town, address, description, logo_url)
  on public.dealers to authenticated;
grant update (name, phone, county_code, town, address, description, logo_url)
  on public.dealers to authenticated;

create policy "Approved dealers are public; members and admins see their own" on public.dealers
  for select to anon, authenticated
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or private.is_dealer_member(id)
    or private.is_admin()
  );

create policy "Signed-in users register a dealer" on public.dealers
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "Owners and managers edit their dealer" on public.dealers
  for update to authenticated
  using (private.is_dealer_member(id, '{owner,manager}'))
  with check (private.is_dealer_member(id, '{owner,manager}'));

-- Dealer KYC (KRA PIN etc.)
revoke all on public.dealer_kyc from anon, authenticated;
grant select on public.dealer_kyc to authenticated;
grant insert (dealer_id, kra_pin, business_reg_no, documents) on public.dealer_kyc to authenticated;
grant update (kra_pin, business_reg_no, documents) on public.dealer_kyc to authenticated;

create policy "Owners, managers and admins read KYC" on public.dealer_kyc
  for select to authenticated
  using (private.is_dealer_member(dealer_id, '{owner,manager}') or private.is_admin());

create policy "Owners and managers submit KYC" on public.dealer_kyc
  for insert to authenticated
  with check (private.is_dealer_member(dealer_id, '{owner,manager}'));

create policy "Owners and managers update KYC" on public.dealer_kyc
  for update to authenticated
  using (private.is_dealer_member(dealer_id, '{owner,manager}'))
  with check (private.is_dealer_member(dealer_id, '{owner,manager}'));

-- Dealer staff
revoke truncate on public.dealer_members from anon, authenticated;
revoke all on public.dealer_members from anon;

create policy "Members see their colleagues" on public.dealer_members
  for select to authenticated
  using (private.is_dealer_member(dealer_id) or private.is_admin());

create policy "Owners add staff" on public.dealer_members
  for insert to authenticated
  with check (private.is_dealer_member(dealer_id, '{owner}'));

create policy "Owners change staff roles" on public.dealer_members
  for update to authenticated
  using (private.is_dealer_member(dealer_id, '{owner}'))
  with check (private.is_dealer_member(dealer_id, '{owner}'));

create policy "Owners remove staff; staff can leave" on public.dealer_members
  for delete to authenticated
  using (private.is_dealer_member(dealer_id, '{owner}') or profile_id = (select auth.uid()));

create or replace function private.protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged() then
    return coalesce(new, old);
  end if;
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.dealer_members
        where dealer_id = old.dealer_id and role = 'owner' and profile_id <> old.profile_id
     ) then
    raise exception 'A dealer must keep at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger dealer_members_protect_last_owner
  before update or delete on public.dealer_members
  for each row execute function private.protect_last_owner();

-- Subscriptions: written by the payments service only
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

create policy "Dealer staff and admins see subscriptions" on public.subscriptions
  for select to authenticated
  using (private.is_dealer_member(dealer_id) or private.is_admin());

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
revoke all on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert (
  dealer_id, model_id, year, mileage_km, price_kes, negotiable, condition, body_type,
  fuel_type, transmission, drivetrain, engine_cc, colour, county_code, town,
  description, features, status
) on public.listings to authenticated;
grant update (
  model_id, year, mileage_km, price_kes, negotiable, condition, body_type,
  fuel_type, transmission, drivetrain, engine_cc, colour, county_code, town,
  description, features, status
) on public.listings to authenticated;
grant delete on public.listings to authenticated;

create policy "Live listings are public; owners and admins see the rest" on public.listings
  for select to anon, authenticated
  using (
    status = 'live'
    or seller_id = (select auth.uid())
    or (dealer_id is not null and private.is_dealer_member(dealer_id))
    or private.is_admin()
  );

create policy "Sellers create their own listings" on public.listings
  for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and (dealer_id is null or private.is_dealer_member(dealer_id))
  );

create policy "Sellers and dealer staff edit listings" on public.listings
  for update to authenticated
  using (
    seller_id = (select auth.uid())
    or (dealer_id is not null and private.is_dealer_member(dealer_id))
    or private.is_admin()
  )
  with check (
    seller_id = (select auth.uid())
    or (dealer_id is not null and private.is_dealer_member(dealer_id))
    or private.is_admin()
  );

create policy "Sellers and dealer staff delete listings" on public.listings
  for delete to authenticated
  using (
    seller_id = (select auth.uid())
    or (dealer_id is not null and private.is_dealer_member(dealer_id, '{owner,manager}'))
  );

-- Status rules and lifecycle timestamps.
--   Sellers may: draft ⇄ pending_review, live → paused/sold, paused → live/sold,
--                rejected → draft/pending_review, expired → pending_review.
--   Only admins (or the service role) move pending_review → live or → rejected.
create or replace function private.guard_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if not private.is_privileged() then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending_review') then
        raise exception 'New listings start as draft or pending_review' using errcode = '42501';
      end if;
      if new.dealer_id is not null and not exists (
        select 1 from public.dealers where id = new.dealer_id and status = 'approved'
      ) then
        raise exception 'Only approved dealers can list stock' using errcode = '42501';
      end if;
    elsif new.status is distinct from old.status then
      allowed := case old.status
        when 'draft' then new.status in ('pending_review')
        when 'pending_review' then new.status in ('draft')
        when 'live' then new.status in ('paused', 'sold')
        when 'paused' then new.status in ('live', 'sold')
        when 'rejected' then new.status in ('draft', 'pending_review')
        when 'expired' then new.status in ('pending_review')
        else false
      end;
      if not allowed then
        raise exception 'Cannot move a listing from % to %', old.status, new.status
          using errcode = '42501';
      end if;
    end if;
  end if;

  if new.status = 'live' and (tg_op = 'INSERT' or old.status <> 'live') then
    new.published_at := coalesce(new.published_at, now());
    if new.expires_at is null or new.expires_at < now() then
      new.expires_at := now() + interval '60 days';
    end if;
  end if;

  if new.status = 'sold' and (tg_op = 'INSERT' or old.status <> 'sold') then
    new.sold_at := now();
  end if;

  return new;
end;
$$;

create trigger listings_guard before insert or update on public.listings
  for each row execute function private.guard_listing();

-- Media follows the listing: visible when the listing is, editable by its owners.
create policy "Media is visible with its listing" on public.listing_media
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "Listing owners manage media" on public.listing_media
  for all to authenticated
  using (exists (
    select 1 from public.listings l
     where l.id = listing_id
       and (l.seller_id = (select auth.uid())
            or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
  ))
  with check (exists (
    select 1 from public.listings l
     where l.id = listing_id
       and (l.seller_id = (select auth.uid())
            or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
  ));
revoke all on public.listing_media from anon;
grant select on public.listing_media to anon;

-- ---------------------------------------------------------------------------
-- Buyer tools: favourites and saved searches are private to their owner
-- ---------------------------------------------------------------------------
revoke all on public.favourites, public.saved_searches from anon;

create policy "Own favourites" on public.favourites
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Own saved searches" on public.saved_searches
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Conversations and messages: participants only
-- ---------------------------------------------------------------------------
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
grant insert (listing_id) on public.conversations to authenticated;

create policy "Participants see conversations" on public.conversations
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or private.is_admin()
  );

create policy "Buyers start conversations" on public.conversations
  for insert to authenticated
  with check (buyer_id = (select auth.uid()));

-- The seller always comes from the listing, never from the client.
create or replace function private.prepare_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_seller uuid;
  listing_state public.listing_status;
begin
  select seller_id, status into listing_seller, listing_state
    from public.listings where id = new.listing_id;
  if listing_seller is null or listing_state <> 'live' then
    raise exception 'You can only message sellers about live listings' using errcode = '42501';
  end if;
  if new.buyer_id = listing_seller then
    raise exception 'You cannot message yourself about your own listing' using errcode = '42501';
  end if;
  new.seller_id := listing_seller;
  return new;
end;
$$;

create trigger conversations_prepare before insert on public.conversations
  for each row execute function private.prepare_conversation();

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create policy "Participants read messages" on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));

create policy "Participants send messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))
    )
  );

create policy "Recipients mark messages read" on public.messages
  for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))
    )
  )
  with check (sender_id <> (select auth.uid()));

create or replace function private.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end;
$$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function private.touch_conversation();

-- ---------------------------------------------------------------------------
-- Leads: anyone can log a call or WhatsApp tap on a live listing; owners read them
-- ---------------------------------------------------------------------------
revoke all on public.leads from anon, authenticated;
grant insert (listing_id, lead_type) on public.leads to anon, authenticated;
grant select on public.leads to authenticated;

create policy "Anyone logs a lead on a live listing" on public.leads
  for insert to anon, authenticated
  with check (
    buyer_id is not distinct from (select auth.uid())
    and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'live')
  );

create policy "Listing owners read their leads" on public.leads
  for select to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.seller_id = (select auth.uid())
              or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
    )
    or private.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Money: read-only through the API; written by the payments service
-- ---------------------------------------------------------------------------
revoke all on public.orders, public.payments, public.ledger_entries from anon, authenticated;
grant select on public.orders, public.payments, public.ledger_entries to authenticated;

create policy "Buyers, dealer managers and admins see orders" on public.orders
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or (dealer_id is not null and private.is_dealer_member(dealer_id, '{owner,manager}'))
    or private.is_admin()
  );

create policy "Admins see payments" on public.payments
  for select to authenticated using (private.is_admin());

create policy "Admins see the ledger" on public.ledger_entries
  for select to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- Trust and admin
-- ---------------------------------------------------------------------------
revoke all on public.reports from anon, authenticated;
grant insert (target_type, target_id, reason, details) on public.reports to authenticated;
grant select on public.reports to authenticated;

create policy "Signed-in users file reports" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters and admins see reports" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_admin());

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy "Admins read the audit log" on public.audit_log
  for select to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- Phase 2: read-only until Safe Deal launches
-- ---------------------------------------------------------------------------
revoke all on public.deals, public.inspections from anon, authenticated;
grant select on public.deals to authenticated;
grant select on public.inspections to anon, authenticated;

create policy "Deal parties and admins see deals" on public.deals
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or private.is_admin()
  );

create policy "Inspections are visible with their listing" on public.inspections
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));
