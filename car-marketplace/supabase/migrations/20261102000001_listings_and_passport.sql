-- =============================================================================
-- Sprint 1: listings, Vehicle Passport capture, photo and document storage, review.
--
-- The Passport (docs: Vehicle Passport spec) gives each physical car one row in
-- `vehicles`, keyed by its chassis number. Documents and odometer readings attach
-- to the vehicle, so they survive when the car is sold and listed again.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.document_kind as enum (
  'odometer_photo', 'auction_sheet', 'export_certificate', 'jevic_certificate',
  'qisj_certificate', 'logbook', 'shaken_certificate', 'other'
);
-- How far we have checked a fact (spec: "Verification levels and badges").
create type public.verification_level as enum ('declared', 'provided', 'checked', 'verified');
create type public.reading_source as enum ('listing', 'auction_sheet', 'shaken', 'jevic', 'qisj', 'inspection', 'service');
create type public.flag_kind as enum ('mileage_decrease', 'auction_doubt', 'low_use', 'import_mismatch');
create type public.flag_status as enum ('open', 'explained', 'dismissed');

-- ---------------------------------------------------------------------------
-- Chassis numbers (mirrors packages/shared/src/vehicle-ids.ts)
-- ---------------------------------------------------------------------------
create or replace function private.parse_chassis(
  p_input text,
  out display text,
  out key text,
  out model_code text,
  out is_vin17 boolean
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
begin
  cleaned := upper(trim(coalesce(p_input, '')));
  cleaned := regexp_replace(cleaned, '\s+', '', 'g');
  cleaned := regexp_replace(cleaned, '[–—]', '-', 'g');
  cleaned := regexp_replace(cleaned, '-+', '-', 'g');
  key := replace(cleaned, '-', '');

  if position('-' in cleaned) = 0 and key ~ '^[A-HJ-NPR-Z0-9]{17}$' then
    display := key; model_code := null; is_vin17 := true;
  elsif cleaned ~ '^[A-Z0-9]{2,8}-[0-9]{4,8}$' then
    display := cleaned; model_code := split_part(cleaned, '-', 1); is_vin17 := false;
  elsif position('-' in cleaned) = 0 and key ~ '^[A-Z0-9]{6,17}$' and key ~ '[A-Z]' and key ~ '[0-9]{4,}$' then
    display := key; model_code := null; is_vin17 := key ~ '^[A-HJ-NPR-Z0-9]{17}$';
  else
    display := null; key := null; model_code := null; is_vin17 := null;
  end if;
end;
$$;

create or replace function private.mask_chassis(p_display text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  serial text;
  k text := replace(p_display, '-', '');
begin
  if p_display ~ '^[A-Z0-9]{2,8}-[0-9]{4,8}$' then
    serial := split_part(p_display, '-', 2);
    return split_part(p_display, '-', 1) || '-' || left(serial, 2)
      || repeat('•', greatest(length(serial) - 4, 1)) || right(serial, 2);
  end if;
  return left(k, 6) || repeat('•', greatest(length(k) - 8, 1)) || right(k, 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vehicles: one row per physical car
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  chassis_key text not null unique check (chassis_key ~ '^[A-Z0-9]{6,17}$'),
  chassis_display text not null,
  chassis_masked text not null,
  model_code text,
  is_vin17 boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.vehicles is 'The Vehicle Passport: one row per car, keyed by chassis number. Created only through listing_identity.';
comment on column public.vehicles.chassis_key is 'Private: not granted to the API. Public pages show chassis_masked.';

-- ---------------------------------------------------------------------------
-- Listings: drafts may be partial; the car is linked through its chassis number
-- ---------------------------------------------------------------------------
alter table public.listings
  alter column mileage_km drop not null,
  alter column price_kes drop not null,
  alter column condition drop not null,
  alter column body_type drop not null,
  alter column fuel_type drop not null,
  alter column transmission drop not null,
  alter column county_code drop not null,
  add column vehicle_id uuid references public.vehicles (id),
  add column rejection_reason text check (char_length(rejection_reason) <= 500),
  add constraint listings_complete_unless_draft check (
    status = 'draft' or (
      mileage_km is not null and price_kes is not null and condition is not null and body_type is not null
      and fuel_type is not null and transmission is not null and county_code is not null
    )
  );

create index listings_vehicle_idx on public.listings (vehicle_id) where vehicle_id is not null;
-- A car can only be on sale once at a time (stops duplicate and cloned listings).
create unique index listings_one_active_per_vehicle on public.listings (vehicle_id)
  where status in ('pending_review', 'live', 'paused');

-- The chassis and plate a seller typed. Private to the seller and admins.
create table public.listing_identity (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  chassis_number text not null,
  registration_number text check (registration_number ~ '^K[A-Z]{2} [0-9]{3}[A-Z]?$'),
  updated_at timestamptz not null default now()
);
comment on table public.listing_identity is 'Seller-entered chassis number and Kenyan plate. Never public; vehicles.chassis_masked is.';

create or replace function private.normalize_listing_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parsed record;
begin
  select * into parsed from private.parse_chassis(new.chassis_number);
  if parsed.key is null then
    raise exception 'Enter the chassis number as on the logbook, e.g. NZE141-1234567 or a 17-character VIN'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and parsed.display is distinct from old.chassis_number and not private.is_privileged() then
    if exists (select 1 from public.listings where id = new.listing_id and status <> 'draft') then
      raise exception 'The chassis number is locked once a listing is submitted' using errcode = '42501';
    end if;
  end if;

  new.chassis_number := parsed.display;
  new.updated_at := now();
  return new;
end;
$$;

create trigger listing_identity_normalize before insert or update on public.listing_identity
  for each row execute function private.normalize_listing_identity();

-- Find or create the vehicle for this chassis and link the listing to it.
create or replace function private.link_listing_vehicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parsed record;
  vehicle uuid;
begin
  select * into parsed from private.parse_chassis(new.chassis_number);

  insert into public.vehicles (chassis_key, chassis_display, chassis_masked, model_code, is_vin17)
  values (parsed.key, parsed.display, private.mask_chassis(parsed.display), parsed.model_code, parsed.is_vin17)
  on conflict (chassis_key) do update set chassis_key = excluded.chassis_key
  returning id into vehicle;

  update public.listings set vehicle_id = vehicle where id = new.listing_id and vehicle_id is distinct from vehicle;
  return null;
end;
$$;

create trigger listing_identity_link after insert or update of chassis_number on public.listing_identity
  for each row execute function private.link_listing_vehicle();

-- ---------------------------------------------------------------------------
-- Passport documents, mileage readings and flags
-- ---------------------------------------------------------------------------
create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete cascade,
  kind public.document_kind not null,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  verification_level public.verification_level not null default 'provided',
  source text not null default 'seller_upload' check (source in ('seller_upload', 'partner', 'staff')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);
create index vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id, kind);
create index vehicle_documents_listing_idx on public.vehicle_documents (listing_id);

-- Documents always attach to the listing's car; the client never chooses the vehicle.
create or replace function private.prepare_vehicle_document()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  listing_vehicle uuid;
begin
  -- Staff and partners may attach documents straight to a vehicle.
  if private.is_privileged() and new.vehicle_id is not null then
    return new;
  end if;

  select vehicle_id into listing_vehicle from public.listings where id = new.listing_id;
  if not found then
    raise exception 'You can only add documents to your own listings' using errcode = '42501';
  end if;
  if listing_vehicle is null then
    raise exception 'Add the chassis number before uploading documents' using errcode = '23514';
  end if;
  if new.storage_path not like new.listing_id::text || '/%' then
    raise exception 'Document path must be inside the listing folder' using errcode = '42501';
  end if;

  new.vehicle_id := listing_vehicle;
  return new;
end;
$$;

create trigger vehicle_documents_prepare before insert on public.vehicle_documents
  for each row execute function private.prepare_vehicle_document();

create table public.odometer_readings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  reading_km integer not null check (reading_km between 0 and 2000000),
  read_on date not null,
  source public.reading_source not null,
  document_id uuid references public.vehicle_documents (id) on delete set null,
  verification_level public.verification_level not null default 'declared',
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index odometer_readings_vehicle_idx on public.odometer_readings (vehicle_id, read_on);

create table public.vehicle_flags (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind public.flag_kind not null,
  status public.flag_status not null default 'open',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz
);
create index vehicle_flags_open_idx on public.vehicle_flags (vehicle_id) where status = 'open';

-- Record a reading whenever a listing is submitted or its mileage changes after
-- submission, then check the car's timeline for a decrease.
create or replace function private.record_listing_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted boolean := new.status = 'pending_review' and old.status is distinct from 'pending_review';
  mileage_changed boolean := new.mileage_km is distinct from old.mileage_km
    and new.status in ('pending_review', 'live', 'paused');
  photo uuid;
  previous record;
  new_reading uuid;
begin
  if new.vehicle_id is null or new.mileage_km is null or not (submitted or mileage_changed) then
    return null;
  end if;

  -- Re-submitting the same figure on the same day is not a new reading.
  if exists (
    select 1 from public.odometer_readings
     where listing_id = new.id and reading_km = new.mileage_km and read_on = current_date
  ) then
    return null;
  end if;

  select id into photo from public.vehicle_documents
   where listing_id = new.id and kind = 'odometer_photo'
   order by created_at desc limit 1;

  insert into public.odometer_readings (vehicle_id, listing_id, reading_km, read_on, source, document_id,
                                        verification_level, recorded_by)
  values (new.vehicle_id, new.id, new.mileage_km, current_date, 'listing', photo,
          case when photo is null then 'declared' else 'provided' end::public.verification_level, auth.uid())
  returning id into new_reading;

  select reading_km, read_on into previous from public.odometer_readings
   where vehicle_id = new.vehicle_id and id <> new_reading and reading_km > new.mileage_km
   order by reading_km desc limit 1;

  if found and not exists (
    select 1 from public.vehicle_flags
     where vehicle_id = new.vehicle_id and kind = 'mileage_decrease' and status = 'open'
  ) then
    insert into public.vehicle_flags (vehicle_id, kind, detail)
    values (new.vehicle_id, 'mileage_decrease', jsonb_build_object(
      'previous_km', previous.reading_km, 'previous_on', previous.read_on,
      'new_km', new.mileage_km, 'listing_id', new.id
    ));
  end if;

  return null;
end;
$$;

create trigger listings_record_reading after update on public.listings
  for each row execute function private.record_listing_reading();

-- ---------------------------------------------------------------------------
-- Listing rules: submission checks, draft-only delete, photo limit
-- ---------------------------------------------------------------------------
create or replace function private.guard_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
  photo_count integer;
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

    -- What a listing needs before anyone reviews it.
    if new.status = 'pending_review' and (tg_op = 'INSERT' or old.status <> 'pending_review') then
      if new.vehicle_id is null then
        raise exception 'Add the chassis number before submitting' using errcode = '23514';
      end if;
      if new.mileage_km is null or new.price_kes is null or new.condition is null or new.body_type is null
         or new.fuel_type is null or new.transmission is null or new.county_code is null then
        raise exception 'Fill in the price, mileage, county and car details before submitting' using errcode = '23514';
      end if;
      select count(*) into photo_count from public.listing_media where listing_id = new.id and kind = 'photo';
      if photo_count < 3 then
        raise exception 'Add at least 3 photos before submitting (you have %)', photo_count using errcode = '23514';
      end if;
      if not exists (
        select 1 from public.vehicle_documents where listing_id = new.id and kind = 'odometer_photo'
      ) then
        raise exception 'Add a dashboard photo showing the mileage before submitting' using errcode = '23514';
      end if;
    end if;
  end if;

  if new.status = 'live' and (tg_op = 'INSERT' or old.status <> 'live') then
    new.published_at := coalesce(new.published_at, now());
    if new.expires_at is null or new.expires_at < now() then
      new.expires_at := now() + interval '60 days';
    end if;
    new.rejection_reason := null;
  end if;

  if new.status = 'sold' and (tg_op = 'INSERT' or old.status <> 'sold') then
    new.sold_at := now();
  end if;

  return new;
end;
$$;

drop policy "Sellers and dealer staff delete listings" on public.listings;
create policy "Sellers and dealer staff delete drafts" on public.listings
  for delete to authenticated
  using (
    status = 'draft'
    and (
      seller_id = (select auth.uid())
      or (dealer_id is not null and private.is_dealer_member(dealer_id, '{owner,manager}'))
    )
  );

alter table public.listing_media add column thumb_path text;

create or replace function private.limit_listing_media()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_media where listing_id = new.listing_id) >= 20 then
    raise exception 'A listing can have up to 20 photos' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger listing_media_limit before insert on public.listing_media
  for each row execute function private.limit_listing_media();

-- ---------------------------------------------------------------------------
-- Security for the new tables
-- ---------------------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.listing_identity enable row level security;
alter table public.vehicle_documents enable row level security;
alter table public.odometer_readings enable row level security;
alter table public.vehicle_flags enable row level security;

revoke all on public.vehicles from anon, authenticated;
grant select (id, chassis_masked, model_code, is_vin17, created_at) on public.vehicles to anon, authenticated;
create policy "Vehicle summaries are public" on public.vehicles for select to anon, authenticated using (true);

revoke all on public.listing_identity from anon, authenticated;
grant select, insert, update on public.listing_identity to authenticated;

create policy "Owners and admins read listing identity" on public.listing_identity
  for select to authenticated
  using (exists (
    select 1 from public.listings l
     where l.id = listing_id
       and (l.seller_id = (select auth.uid())
            or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id))
            or private.is_admin())
  ));

create policy "Owners set listing identity" on public.listing_identity
  for insert to authenticated
  with check (exists (
    select 1 from public.listings l
     where l.id = listing_id
       and (l.seller_id = (select auth.uid())
            or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
  ));

create policy "Owners update listing identity" on public.listing_identity
  for update to authenticated
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

revoke all on public.vehicle_documents from anon, authenticated;
grant select, delete on public.vehicle_documents to authenticated;
grant insert (listing_id, kind, storage_path, content_type, size_bytes) on public.vehicle_documents to authenticated;

create policy "Uploaders, listing owners and admins read documents" on public.vehicle_documents
  for select to authenticated
  using (
    uploaded_by = (select auth.uid())
    or private.is_admin()
    or exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.seller_id = (select auth.uid())
              or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
    )
  );

create policy "Listing owners upload documents" on public.vehicle_documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.seller_id = (select auth.uid())
              or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
    )
  );

create policy "Uploaders remove unchecked documents" on public.vehicle_documents
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) and verification_level = 'provided');

revoke all on public.odometer_readings, public.vehicle_flags from anon, authenticated;
grant select on public.odometer_readings, public.vehicle_flags to authenticated;

create policy "Listing owners and admins read readings" on public.odometer_readings
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.seller_id = (select auth.uid())
              or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
    )
  );

create policy "Admins read flags" on public.vehicle_flags
  for select to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: public listing photos, private Passport documents
-- Paths are "<listing id>/<file>", so ownership follows the listing.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-photos', 'listing-photos', true, 5242880, array['image/webp', 'image/jpeg']),
  ('vehicle-documents', 'vehicle-documents', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create or replace function private.owns_listing_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listings l
     where l.id::text = (storage.foldername(p_name))[1]
       and (l.seller_id = (select auth.uid())
            or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id)))
  );
$$;
grant execute on function private.owns_listing_folder(text) to authenticated;

create policy "Listing owners manage photo files" on storage.objects
  for all to authenticated
  using (bucket_id = 'listing-photos' and private.owns_listing_folder(name))
  with check (bucket_id = 'listing-photos' and private.owns_listing_folder(name));

create policy "Listing owners manage document files" on storage.objects
  for all to authenticated
  using (bucket_id = 'vehicle-documents' and private.owns_listing_folder(name))
  with check (bucket_id = 'vehicle-documents' and private.owns_listing_folder(name));

create policy "Admins read document files" on storage.objects
  for select to authenticated
  using (bucket_id = 'vehicle-documents' and private.is_admin());

-- ---------------------------------------------------------------------------
-- Read model: one view for cards, pages, dashboards and the review queue.
-- security_invoker makes the view obey the RLS of the tables underneath.
-- ---------------------------------------------------------------------------
create view public.listing_overview with (security_invoker = true) as
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
  v.chassis_masked
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

revoke all on public.listing_overview from anon, authenticated;
grant select on public.listing_overview to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Step one of selling: create the draft and its Passport link in one transaction.
create or replace function public.start_listing(p_model_id integer, p_year integer, p_chassis text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
  default_body public.body_type;
  seller_county smallint;
begin
  select body_type into default_body from public.models where id = p_model_id;
  select county_code into seller_county from public.profiles where id = (select auth.uid());

  insert into public.listings (model_id, year, body_type, county_code, status)
  values (p_model_id, p_year, default_body, seller_county, 'draft')
  returning id into new_id;

  insert into public.listing_identity (listing_id, chassis_number) values (new_id, p_chassis);
  return new_id;
end;
$$;
revoke execute on function public.start_listing(integer, integer, text) from public, anon;
grant execute on function public.start_listing(integer, integer, text) to authenticated;

-- Put a listing's photos in the order given (first = cover).
create or replace function public.reorder_listing_media(p_listing_id uuid, p_media_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.listing_media m
     set position = o.ord - 1
    from unnest(p_media_ids) with ordinality as o(id, ord)
   where m.id = o.id and m.listing_id = p_listing_id;
$$;
revoke execute on function public.reorder_listing_media(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_listing_media(uuid, uuid[]) to authenticated;

-- What buyers may see of a car's Passport. Documents from other sellers' listings
-- count only once staff have checked them, so nobody can pad a car's history
-- through a throwaway draft.
create or replace function public.listing_passport(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l record;
begin
  select id, status, seller_id, dealer_id, vehicle_id into l from public.listings where id = p_listing_id;
  if not found then
    return null;
  end if;
  if not (
    l.status = 'live'
    or l.seller_id = (select auth.uid())
    or (l.dealer_id is not null and private.is_dealer_member(l.dealer_id))
    or private.is_admin()
  ) then
    return null;
  end if;
  if l.vehicle_id is null then
    return jsonb_build_object('vehicle', null, 'documents', '[]'::jsonb, 'readings', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'vehicle', (
      select jsonb_build_object('chassis_masked', v.chassis_masked, 'model_code', v.model_code,
                                'is_vin17', v.is_vin17, 'first_seen', v.created_at)
        from public.vehicles v where v.id = l.vehicle_id
    ),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('kind', d.kind, 'verification_level', d.verification_level,
                                          'uploaded_at', d.created_at) order by d.created_at)
        from public.vehicle_documents d
       where d.vehicle_id = l.vehicle_id
         and (d.listing_id = l.id or d.verification_level in ('checked', 'verified'))
    ), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object('reading_km', r.reading_km, 'read_on', r.read_on,
                                          'source', r.source, 'verification_level', r.verification_level)
                       order by r.read_on, r.created_at)
        from public.odometer_readings r
       where r.vehicle_id = l.vehicle_id
         and (
           r.listing_id = l.id
           or r.verification_level in ('checked', 'verified')
           or exists (select 1 from public.listings o where o.id = r.listing_id and o.published_at is not null)
         )
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.listing_passport(uuid) to anon, authenticated;

-- Moderation (Sprint 1 minimum; the full console arrives in Sprint 6).
create or replace function public.admin_review_listing(p_listing_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin() then
    raise exception 'Only admins can review listings' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;
  if p_decision = 'reject' and reason is null then
    raise exception 'Give a reason so the seller knows what to fix' using errcode = '22023';
  end if;

  update public.listings
     set status = case when p_decision = 'approve' then 'live' else 'rejected' end::public.listing_status,
         rejection_reason = case when p_decision = 'reject' then reason end
   where id = p_listing_id and status = 'pending_review';
  if not found then
    raise exception 'This listing is not waiting for review' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id, data)
  values ((select auth.uid()), 'listing.' || p_decision, 'listing', p_listing_id,
          jsonb_build_object('reason', reason));
end;
$$;
revoke execute on function public.admin_review_listing(uuid, text, text) from public, anon;
grant execute on function public.admin_review_listing(uuid, text, text) to authenticated;

-- Run on a schedule (Supabase cron or a scheduled function) with the service role.
create or replace function public.expire_due_listings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.listings set status = 'expired' where status = 'live' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.expire_due_listings() from public, anon, authenticated;
grant execute on function public.expire_due_listings() to service_role;

-- Columns filled in by triggers (the generated types make them optional on insert).
comment on column public.vehicle_documents.vehicle_id is 'Set by trigger from the listing; clients never choose the vehicle.';
comment on column public.conversations.seller_id is 'Set by trigger from the listing; clients never choose the seller.';
