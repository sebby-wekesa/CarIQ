-- Listing cards show promotion badges, so favourites must return the listing timestamps too.
-- PostgreSQL requires dropping and recreating a TABLE-returning function to change its result shape.
drop function public.my_favourites();

create function public.my_favourites()
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
  boosted_until timestamptz,
  featured_until timestamptz,
  status public.listing_status,
  is_public boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, f.created_at, o.title, o.price_kes, o.negotiable, o.mileage_km, o.year, o.county_name,
         o.town, o.transmission, o.fuel_type, o.condition, o.cover_thumb_path, o.photo_count,
         o.boosted_until, o.featured_until, o.status, o.is_public
    from public.favourites f
    join public.listing_overview o on o.id = f.listing_id
   where f.profile_id = (select auth.uid())
   order by f.created_at desc;
$$;

revoke execute on function public.my_favourites() from public, anon;
grant execute on function public.my_favourites() to authenticated;
