-- =============================================================================
-- Car marketplace — schema v1
--
-- Conventions
--   * Money is whole Kenyan shillings in bigint columns named *_kes.
--   * Phone numbers are E.164 (+2547XXXXXXXX).
--   * Every table has RLS enabled (see 0002_rls.sql). Client code must select
--     explicit columns — some columns are deliberately not granted to the API.
--   * Helper functions live in the `private` schema, which the API does not expose.
--   * Enums mirror packages/shared/src/vehicle.ts — change both together.
-- =============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('user', 'admin');
create type public.dealer_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type public.dealer_role as enum ('owner', 'manager', 'sales');

create type public.body_type as enum (
  'saloon', 'hatchback', 'station_wagon', 'suv', 'pickup', 'van', 'minibus',
  'coupe', 'convertible', 'truck', 'bus'
);
create type public.fuel_type as enum ('petrol', 'diesel', 'hybrid', 'electric', 'lpg');
create type public.transmission as enum ('automatic', 'manual', 'cvt', 'semi_automatic');
create type public.drivetrain as enum ('fwd', 'rwd', 'awd', 'four_wd');
create type public.vehicle_condition as enum ('foreign_used', 'locally_used', 'new');
create type public.listing_status as enum (
  'draft', 'pending_review', 'live', 'paused', 'sold', 'expired', 'rejected'
);
create type public.media_kind as enum ('photo', 'video');
create type public.lead_type as enum ('chat', 'call', 'whatsapp');

create type public.plan_period as enum ('monthly', 'annual');
create type public.subscription_status as enum ('active', 'past_due', 'cancelled', 'expired');
create type public.order_product as enum ('listing_boost', 'featured_slot', 'dealer_plan', 'inspection');
create type public.order_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled', 'refunded');

create type public.report_target as enum ('listing', 'profile', 'dealer', 'message');
create type public.report_reason as enum ('scam', 'wrong_info', 'already_sold', 'duplicate', 'offensive', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- Phase 2 (schema only)
create type public.deal_state as enum (
  'offered', 'funded', 'inspecting', 'transfer_pending', 'completed', 'cancelled', 'disputed', 'refunded'
);
create type public.inspection_result as enum ('pass', 'pass_with_issues', 'fail');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.counties (
  code smallint primary key check (code between 1 and 47),
  name text not null unique,
  slug text not null unique
);
comment on table public.counties is 'Kenya''s 47 counties. Mirrors packages/shared/src/counties.ts.';

create table public.makes (
  id smallint generated always as identity primary key,
  name text not null unique,
  slug text not null unique,
  is_popular boolean not null default false,
  sort_order smallint not null default 100
);

create table public.models (
  id integer generated always as identity primary key,
  make_id smallint not null references public.makes (id) on delete restrict,
  name text not null,
  slug text not null,
  body_type public.body_type,
  unique (make_id, slug)
);
create index models_make_id_idx on public.models (make_id);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique check (phone ~ '^\+254[17][0-9]{8}$'),
  full_name text check (char_length(full_name) between 2 and 80),
  county_code smallint references public.counties (code),
  avatar_url text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.phone is 'Private: not granted to the API. Read your own from the auth session.';
comment on column public.profiles.role is 'Private: not granted to the API. Use public.current_user_is_admin().';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile whenever Supabase Auth creates a user (phone OTP sign-up).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_phone text;
begin
  normalized_phone := case
    when new.phone is null or new.phone = '' then null
    when left(new.phone, 1) = '+' then new.phone
    else '+' || new.phone
  end;

  insert into public.profiles (id, phone, full_name)
  values (
    new.id,
    case when normalized_phone ~ '^\+254[17][0-9]{8}$' then normalized_phone end,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profiles.phone in step if the user changes their number in Auth.
create or replace function private.handle_user_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set phone = case
       when new.phone is null or new.phone = '' then null
       when left(new.phone, 1) = '+' then new.phone
       else '+' || new.phone
     end
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_phone_changed after update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function private.handle_user_phone_change();

-- ---------------------------------------------------------------------------
-- Dealers (tenants)
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  price_kes bigint not null check (price_kes >= 0),
  period public.plan_period not null default 'monthly',
  listing_limit integer check (listing_limit is null or listing_limit > 0),
  featured_slots smallint not null default 0 check (featured_slots >= 0),
  is_active boolean not null default true,
  sort_order smallint not null default 100
);
comment on column public.plans.listing_limit is 'null = unlimited';

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  phone text check (phone ~ '^\+254[17][0-9]{8}$'),
  county_code smallint not null references public.counties (code),
  town text,
  address text,
  description text check (char_length(description) <= 2000),
  logo_url text,
  status public.dealer_status not null default 'pending',
  verified_at timestamptz,
  plan_id text references public.plans (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dealers_county_status_idx on public.dealers (county_code, status);

create trigger dealers_updated_at before update on public.dealers
  for each row execute function private.set_updated_at();

-- KYC lives apart from the public dealer row so it can never leak through a listing page.
create table public.dealer_kyc (
  dealer_id uuid primary key references public.dealers (id) on delete cascade,
  kra_pin text not null check (kra_pin ~ '^[AP][0-9]{9}[A-Z]$'),
  business_reg_no text,
  documents jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  review_notes text
);
comment on column public.dealer_kyc.kra_pin is 'KRA PIN format: A or P, nine digits, a letter (e.g. P051234567X).';

create table public.dealer_members (
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.dealer_role not null default 'sales',
  created_at timestamptz not null default now(),
  primary key (dealer_id, profile_id)
);
create index dealer_members_profile_idx on public.dealer_members (profile_id);

-- The person who registers a dealer becomes its owner.
create or replace function private.handle_new_dealer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.dealer_members (dealer_id, profile_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_dealer_created after insert on public.dealers
  for each row execute function private.handle_new_dealer();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null default 'active',
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);
create index subscriptions_dealer_idx on public.subscriptions (dealer_id, status);
-- One live subscription per dealer.
create unique index subscriptions_one_active_idx on public.subscriptions (dealer_id)
  where status in ('active', 'past_due');

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  dealer_id uuid references public.dealers (id) on delete set null,
  model_id integer not null references public.models (id),
  year smallint not null check (year between 1980 and 2100),
  mileage_km integer not null check (mileage_km between 0 and 2000000),
  price_kes bigint not null check (price_kes between 10000 and 1000000000),
  negotiable boolean not null default true,
  condition public.vehicle_condition not null,
  body_type public.body_type not null,
  fuel_type public.fuel_type not null,
  transmission public.transmission not null,
  drivetrain public.drivetrain,
  engine_cc integer check (engine_cc between 50 and 20000),
  colour text check (char_length(colour) <= 40),
  county_code smallint not null references public.counties (code),
  town text check (char_length(town) <= 80),
  description text check (char_length(description) <= 5000),
  features text[] not null default '{}',
  status public.listing_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  sold_at timestamptz,
  boosted_until timestamptz,
  featured_until timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.listings.boosted_until is 'Set only by the payments service after a paid boost.';

create index listings_live_idx on public.listings (status, published_at desc) where status = 'live';
create index listings_seller_idx on public.listings (seller_id);
create index listings_dealer_idx on public.listings (dealer_id) where dealer_id is not null;
create index listings_search_idx on public.listings (county_code, model_id, price_kes) where status = 'live';

create trigger listings_updated_at before update on public.listings
  for each row execute function private.set_updated_at();

create table public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind public.media_kind not null default 'photo',
  storage_path text not null,
  position smallint not null default 0 check (position between 0 and 29),
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create index listing_media_listing_idx on public.listing_media (listing_id, position);

create table public.favourites (
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null default '{}'::jsonb,
  alerts_enabled boolean not null default true,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create index saved_searches_profile_idx on public.saved_searches (profile_id);

-- ---------------------------------------------------------------------------
-- Leads and messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid default auth.uid() references public.profiles (id) on delete set null,
  lead_type public.lead_type not null,
  created_at timestamptz not null default now()
);
create index leads_listing_idx on public.leads (listing_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Money: orders, payments, ledger
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  dealer_id uuid references public.dealers (id),
  product public.order_product not null,
  listing_id uuid references public.listings (id) on delete set null,
  plan_id text references public.plans (id),
  amount_kes bigint not null check (amount_kes > 0),
  status public.order_status not null default 'pending',
  etims_invoice_no text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_dealer_idx on public.orders (dealer_id) where dealer_id is not null;

create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  provider text not null,
  provider_ref text not null,
  amount_kes bigint not null check (amount_kes > 0),
  status public.payment_status not null default 'pending',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payments_order_idx on public.payments (order_id);

create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

-- Double-entry ledger. Each journal (a group of rows sharing journal_id) must
-- balance; the constraint trigger below checks it at commit.
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  journal_id uuid not null,
  account text not null check (account ~ '^[a-z]+(:[a-z0-9_]+)*$'),
  debit_kes bigint not null default 0 check (debit_kes >= 0),
  credit_kes bigint not null default 0 check (credit_kes >= 0),
  order_id uuid references public.orders (id),
  payment_id uuid references public.payments (id),
  memo text,
  created_at timestamptz not null default now(),
  check ((debit_kes = 0) <> (credit_kes = 0))
);
comment on column public.ledger_entries.account is 'e.g. assets:cashia_clearing, revenue:boosts, liabilities:vat_output';
create index ledger_entries_journal_idx on public.ledger_entries (journal_id);
create index ledger_entries_account_idx on public.ledger_entries (account, created_at);

create or replace function private.assert_journal_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := coalesce(new.journal_id, old.journal_id);
  imbalance bigint;
begin
  select coalesce(sum(debit_kes), 0) - coalesce(sum(credit_kes), 0)
    into imbalance
    from public.ledger_entries
   where journal_id = target;
  if imbalance <> 0 then
    raise exception 'Ledger journal % does not balance (debits - credits = %)', target, imbalance
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger ledger_journal_balanced
  after insert or update or delete on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.assert_journal_balanced();

-- Ledger rows are append-only: corrections are new reversing journals.
create or replace function private.prevent_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger_entries are append-only; post a reversing journal instead'
    using errcode = '42501';
end;
$$;

create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function private.prevent_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Trust and admin
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 2000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_open_idx on public.reports (created_at) where status = 'open';

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_target_idx on public.audit_log (target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Phase 2 — schema only. No API writes are granted until Safe Deal launches.
-- ---------------------------------------------------------------------------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id),
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  agreed_price_kes bigint not null check (agreed_price_kes > 0),
  held_amount_kes bigint not null default 0 check (held_amount_kes >= 0),
  fee_kes bigint not null default 0 check (fee_kes >= 0),
  state public.deal_state not null default 'offered',
  provider_hold_ref text,
  transfer_proof_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index deals_listing_idx on public.deals (listing_id);

create trigger deals_updated_at before update on public.deals
  for each row execute function private.set_updated_at();

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  deal_id uuid references public.deals (id),
  garage_name text not null,
  inspector_name text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  result public.inspection_result,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index inspections_listing_idx on public.inspections (listing_id);
