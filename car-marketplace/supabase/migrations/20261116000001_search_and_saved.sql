-- Sprint 2: search and discovery.
--
-- One definition of "which live cars match these filters" (public.search_listings) serves the
-- search page, the make/model/county landing pages, similar cars and saved-search alerts, so a
-- buyer's alert can never disagree with what the search page shows.
--
-- Filters are a small JSON object whose keys match the search page's URL parameters:
--   make, model, county                  slugs ("toyota", "corolla-axio", "mombasa")
--   price_min, price_max                 whole shillings
--   year_min, year_max, mileage_max      integers
--   body, fuel, transmission, condition  arrays of enum values (any of)
--   q                                    free text; every word must appear in the listing
-- packages/shared/src/search.ts validates the same shape on the app side.

-- ---------------------------------------------------------------------------
-- Read model: slugs on the overview so filters and links don't need extra joins
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
  c.slug as county_slug
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

-- Sort orders the search page offers, each limited to live cars.
create index listings_live_price_idx on public.listings (price_kes, published_at desc) where status = 'live';
create index listings_live_mileage_idx on public.listings (mileage_km, published_at desc) where status = 'live';
create index listings_live_year_idx on public.listings (year desc, published_at desc) where status = 'live';
create index listings_live_model_idx on public.listings (model_id, published_at desc) where status = 'live';

-- ---------------------------------------------------------------------------
-- Filter validation, shared by saved searches and tests
-- ---------------------------------------------------------------------------
create or replace function private.valid_enum_list(value jsonb, allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'array'
     and jsonb_array_length(value) between 1 and 12
     and not exists (
       select 1 from jsonb_array_elements(value) e
        where jsonb_typeof(e) <> 'string' or not (e #>> '{}') = any (allowed));
$$;

create or replace function private.valid_search_filters(f jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(f) = 'object'
     and pg_column_size(f) <= 2048
     and not exists (
       select 1 from jsonb_object_keys(f) k
        where k not in ('make', 'model', 'county', 'price_min', 'price_max', 'year_min', 'year_max',
                        'mileage_max', 'body', 'fuel', 'transmission', 'condition', 'q'))
     and coalesce((select bool_and(jsonb_typeof(f -> k) = 'string' and (f ->> k) ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
                     from unnest(array['make', 'model', 'county']) k where f ? k), true)
     and coalesce((select bool_and(jsonb_typeof(f -> k) = 'number' and (f ->> k) ~ '^[0-9]{1,10}$')
                     from unnest(array['price_min', 'price_max', 'year_min', 'year_max', 'mileage_max']) k
                    where f ? k), true)
     and (not f ? 'model' or f ? 'make')
     and (not f ? 'q' or (jsonb_typeof(f -> 'q') = 'string' and char_length(f ->> 'q') between 1 and 60))
     and (not f ? 'body' or private.valid_enum_list(f -> 'body', enum_range(null::public.body_type)::text[]))
     and (not f ? 'fuel' or private.valid_enum_list(f -> 'fuel', enum_range(null::public.fuel_type)::text[]))
     and (not f ? 'transmission'
          or private.valid_enum_list(f -> 'transmission', enum_range(null::public.transmission)::text[]))
     and (not f ? 'condition'
          or private.valid_enum_list(f -> 'condition', enum_range(null::public.vehicle_condition)::text[]));
$$;

grant execute on function private.valid_search_filters(jsonb) to anon, authenticated;
grant execute on function private.valid_enum_list(jsonb, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
-- Deliberately a plain SQL function with no SET clause and fully qualified names: Postgres
-- inlines it into the caller's query, so the page's ORDER BY and LIMIT reach the indexes
-- instead of sorting every match. It runs with the caller's rights, so row-level security
-- still decides what anyone can see; is_public then narrows that to cars on sale.
create or replace function public.search_listings(p_filters jsonb default '{}'::jsonb)
returns setof public.listing_overview
language sql
stable
as $$
  select o.*
    from public.listing_overview o
   where o.is_public
     and (p_filters ->> 'make' is null or o.make_slug = p_filters ->> 'make')
     and (p_filters ->> 'model' is null or o.model_slug = p_filters ->> 'model')
     and (p_filters ->> 'county' is null or o.county_slug = p_filters ->> 'county')
     and (p_filters ->> 'price_min' is null or o.price_kes >= (p_filters ->> 'price_min')::bigint)
     and (p_filters ->> 'price_max' is null or o.price_kes <= (p_filters ->> 'price_max')::bigint)
     and (p_filters ->> 'year_min' is null or o.year >= (p_filters ->> 'year_min')::integer)
     and (p_filters ->> 'year_max' is null or o.year <= (p_filters ->> 'year_max')::integer)
     and (p_filters ->> 'mileage_max' is null or o.mileage_km <= (p_filters ->> 'mileage_max')::integer)
     and (p_filters -> 'body' is null
          or o.body_type::text in (select jsonb_array_elements_text(p_filters -> 'body')))
     and (p_filters -> 'fuel' is null
          or o.fuel_type::text in (select jsonb_array_elements_text(p_filters -> 'fuel')))
     and (p_filters -> 'transmission' is null
          or o.transmission::text in (select jsonb_array_elements_text(p_filters -> 'transmission')))
     and (p_filters -> 'condition' is null
          or o.condition::text in (select jsonb_array_elements_text(p_filters -> 'condition')))
     and (coalesce(p_filters ->> 'q', '') = '' or not exists (
           select 1
             from regexp_split_to_table(lower(trim(p_filters ->> 'q')), '\s+') as word
            where word <> ''
              and lower(concat_ws(' ', o.title, o.colour, o.town, o.description))
                  not like '%' || replace(replace(replace(word, '\', '\\'), '%', '\%'), '_', '\_') || '%'));
$$;

comment on function public.search_listings(jsonb) is
  'Live listings matching a filter object. Callers add ORDER BY / LIMIT (PostgREST: order and range).';

revoke execute on function public.search_listings(jsonb) from public;
grant execute on function public.search_listings(jsonb) to anon, authenticated, service_role;

-- How many live cars each make, model, county and combination has: landing pages, internal
-- links and the sitemap only list pages that have cars on them.
create or replace function public.listing_facets()
returns table (
  make_slug text,
  make_name text,
  model_slug text,
  model_name text,
  county_slug text,
  county_name text,
  listings bigint,
  min_price_kes bigint,
  max_price_kes bigint
)
language sql
stable
set search_path = ''
as $$
  select o.make_slug,
         case when grouping(o.make_slug) = 0 then min(o.make_name) end,
         o.model_slug,
         case when grouping(o.model_slug) = 0 then min(o.model_name) end,
         o.county_slug,
         case when grouping(o.county_slug) = 0 then min(o.county_name) end,
         count(*),
         min(o.price_kes),
         max(o.price_kes)
    from public.listing_overview o
   where o.is_public
   group by grouping sets (
     (o.make_slug),
     (o.make_slug, o.model_slug),
     (o.county_slug),
     (o.make_slug, o.county_slug),
     (o.make_slug, o.model_slug, o.county_slug)
   );
$$;

revoke execute on function public.listing_facets() from public;
grant execute on function public.listing_facets() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Favourites: a buyer's shortlist. Only cars on sale can be added; they stay on the list
-- (shown as sold or unavailable) after the seller moves on.
-- ---------------------------------------------------------------------------
revoke all on public.favourites from anon, authenticated;
grant select, delete on public.favourites to authenticated;
grant insert (listing_id) on public.favourites to authenticated;

drop policy "Own favourites" on public.favourites;

create policy "Buyers see their favourites" on public.favourites
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "Buyers save live cars" on public.favourites
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.listings l
       where l.id = listing_id and l.status = 'live' and (l.expires_at is null or l.expires_at > now())
    )
  );

create policy "Buyers remove favourites" on public.favourites
  for delete to authenticated
  using (profile_id = (select auth.uid()));

create index favourites_listing_idx on public.favourites (listing_id);

create or replace function private.cap_favourites()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.favourites where profile_id = new.profile_id) >= 500 then
    raise exception 'You can save up to 500 cars. Remove some to save more.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger favourites_cap before insert on public.favourites
  for each row execute function private.cap_favourites();

-- The signed-in buyer's saved cars, including ones no longer on sale (status tells which).
-- Security definer because a sold car is no longer readable through the listings policy.
create or replace function public.my_favourites()
returns table (
  listing_id uuid,
  saved_at timestamptz,
  title text,
  price_kes bigint,
  negotiable boolean,
  mileage_km integer,
  year smallint,
  county_name text,
  town text,
  transmission public.transmission,
  fuel_type public.fuel_type,
  condition public.vehicle_condition,
  cover_thumb_path text,
  photo_count integer,
  status public.listing_status,
  is_public boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, f.created_at, o.title, o.price_kes, o.negotiable, o.mileage_km, o.year, o.county_name,
         o.town, o.transmission, o.fuel_type, o.condition, o.cover_thumb_path, o.photo_count, o.status,
         o.is_public
    from public.favourites f
    join public.listing_overview o on o.id = f.listing_id
   where f.profile_id = (select auth.uid())
   order by f.created_at desc;
$$;

revoke execute on function public.my_favourites() from public, anon;
grant execute on function public.my_favourites() to authenticated;

-- ---------------------------------------------------------------------------
-- Saved searches
-- ---------------------------------------------------------------------------
alter table public.saved_searches
  add column last_seen_at timestamptz not null default now(),
  add constraint saved_searches_filters_valid check (private.valid_search_filters(filters)),
  add constraint saved_searches_not_empty check (filters <> '{}'::jsonb),
  add constraint saved_searches_unique unique (profile_id, filters);

comment on column public.saved_searches.last_seen_at is 'When the owner last opened this search; drives "N new".';
comment on column public.saved_searches.last_alerted_at is 'Set by queue_saved_search_alerts() only.';

revoke all on public.saved_searches from anon, authenticated;
grant select, delete on public.saved_searches to authenticated;
grant insert (name, filters, alerts_enabled) on public.saved_searches to authenticated;
grant update (name, alerts_enabled) on public.saved_searches to authenticated;

create or replace function private.cap_saved_searches()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_searches where profile_id = new.profile_id) >= 20 then
    raise exception 'You can save up to 20 searches. Delete one to save another.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger saved_searches_cap before insert on public.saved_searches
  for each row execute function private.cap_saved_searches();

-- The signed-in buyer's saved searches with how many cars match now and how many are new
-- since they last opened each one (their own listings don't count as new).
create or replace function public.my_saved_searches()
returns table (
  id uuid,
  name text,
  filters jsonb,
  alerts_enabled boolean,
  created_at timestamptz,
  last_seen_at timestamptz,
  total_count bigint,
  new_count bigint
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.name, s.filters, s.alerts_enabled, s.created_at, s.last_seen_at,
         coalesce(m.total, 0), coalesce(m.fresh, 0)
    from public.saved_searches s
    left join lateral (
      select count(*) as total,
             count(*) filter (where r.published_at > s.last_seen_at
                                and r.seller_id is distinct from (select auth.uid())) as fresh
        from public.search_listings(s.filters) r
    ) m on true
   where s.profile_id = (select auth.uid())
   order by s.created_at desc;
$$;

revoke execute on function public.my_saved_searches() from public, anon;
grant execute on function public.my_saved_searches() to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: an outbox per person. Sprint 2 writes saved-search matches and shows them
-- in the app; Sprint 3 adds SMS and email delivery from the same rows.
-- ---------------------------------------------------------------------------
create type public.notification_kind as enum ('saved_search_match');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  saved_search_id uuid references public.saved_searches (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
create index notifications_unread_idx on public.notifications (profile_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create policy "People see their notifications" on public.notifications
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- Opening a saved search: returns its filters and when it was last seen (to mark new cars),
-- then marks it seen and clears its unread alerts.
create or replace function public.open_saved_search(p_id uuid)
returns table (filters jsonb, previously_seen_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_filters jsonb;
  seen timestamptz;
begin
  select s.filters, s.last_seen_at into found_filters, seen
    from public.saved_searches s
   where s.id = p_id and s.profile_id = (select auth.uid())
   for update;
  if not found then
    raise exception 'Saved search not found' using errcode = 'P0002';
  end if;

  update public.saved_searches set last_seen_at = now() where id = p_id;
  update public.notifications set read_at = now()
   where saved_search_id = p_id and profile_id = (select auth.uid()) and read_at is null;

  return query select found_filters, seen;
end;
$$;

revoke execute on function public.open_saved_search(uuid) from public, anon;
grant execute on function public.open_saved_search(uuid) to authenticated;

-- Which listings have already been announced for each saved search, so overlapping runs never
-- announce the same car twice. Internal to the alert job.
create table private.saved_search_hits (
  saved_search_id uuid not null references public.saved_searches (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  found_at timestamptz not null default now(),
  primary key (saved_search_id, listing_id)
);
alter table private.saved_search_hits enable row level security;
revoke all on private.saved_search_hits from public, anon, authenticated;

-- Run every 15 minutes with the service role (see the schedules migration). For each saved
-- search with alerts on, finds cars published since the last run (with a short overlap so a
-- listing approved mid-run is never missed), records them, and queues one notification.
create or replace function public.queue_saved_search_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  search record;
  started timestamptz := now();
  new_ids uuid[];
  queued integer := 0;
begin
  for search in
    select s.id, s.profile_id, s.name, s.filters, coalesce(s.last_alerted_at, s.created_at) as since
      from public.saved_searches s
     where s.alerts_enabled
     for update skip locked
  loop
    with fresh as (
      select r.id, r.published_at
        from public.search_listings(search.filters) r
       where r.published_at > search.since - interval '5 minutes'
         and r.seller_id is distinct from search.profile_id
    ), recorded as (
      insert into private.saved_search_hits (saved_search_id, listing_id)
      select search.id, fresh.id from fresh
      on conflict do nothing
      returning listing_id
    )
    select array_agg(fresh.id order by fresh.published_at desc)
      into new_ids
      from recorded join fresh on fresh.id = recorded.listing_id;

    if new_ids is not null then
      insert into public.notifications (profile_id, kind, saved_search_id, payload)
      values (search.profile_id, 'saved_search_match', search.id,
              jsonb_build_object('name', search.name,
                                 'count', cardinality(new_ids),
                                 'listing_ids', to_jsonb(new_ids[1:5])));
      queued := queued + 1;
    end if;

    update public.saved_searches set last_alerted_at = started where id = search.id;
  end loop;

  delete from private.saved_search_hits where found_at < now() - interval '90 days';
  return queued;
end;
$$;

revoke execute on function public.queue_saved_search_alerts() from public, anon, authenticated;
grant execute on function public.queue_saved_search_alerts() to service_role;
