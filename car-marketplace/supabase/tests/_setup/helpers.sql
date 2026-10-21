-- =============================================================================
-- Test helpers. Loaded after migrations by scripts/db-test.sh.
-- Each *.test.sql file runs in its own transaction and rolls back.
-- =============================================================================

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.users (name text primary key, id uuid not null);
grant select on tests.users to anon, authenticated, service_role;

-- Ids created during a test, by name (writable by every role so fixtures can be made as any user).
create table tests.fixtures (name text primary key, id uuid not null);
grant select, insert on tests.fixtures to anon, authenticated, service_role;

create function tests.fx(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.fixtures where name = p_name $$;

create function tests.model_id(p_make_slug text, p_model_slug text)
returns integer
language sql
stable
as $$
  select m.id from public.models m join public.makes mk on mk.id = m.make_id
   where mk.slug = p_make_slug and m.slug = p_model_slug
$$;

-- Create an Auth user (the profile is created by our trigger) and remember it by name.
create function tests.create_user(p_name text, p_phone text, p_full_name text default null)
returns uuid
language plpgsql
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, phone, raw_user_meta_data)
  values (new_id, p_phone, case when p_full_name is null then '{}'::jsonb
                                else jsonb_build_object('full_name', p_full_name) end);
  insert into tests.users (name, id) values (p_name, new_id);
  return new_id;
end;
$$;

create function tests.id(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.users where name = p_name $$;

-- Act as a signed-in user, as anon, as the service role, or go back to the test superuser.
create function tests.authenticate_as(p_name text)
returns void
language plpgsql
as $$
declare
  uid uuid := tests.id(p_name);
begin
  if uid is null then raise exception 'No test user named %', p_name; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

create function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
end;
$$;

create function tests.as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
end;
$$;

create function tests.as_superuser()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Assertions ------------------------------------------------------------------
create function tests.ok(p_condition boolean, p_message text)
returns text
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'FAIL: %', p_message;
  end if;
  return 'ok - ' || p_message;
end;
$$;

create function tests.eq(p_actual anyelement, p_expected anyelement, p_message text)
returns text
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)', p_message, p_expected, p_actual;
  end if;
  return 'ok - ' || p_message;
end;
$$;

-- Runs a statement and returns how many rows it touched (RLS makes blocked updates touch 0).
create function tests.rows(p_sql text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Expects a statement to fail, optionally with a specific SQLSTATE.
create function tests.throws(p_sql text, p_errcode text, p_message text)
returns text
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_errcode is null or sqlstate = p_errcode then
      return 'ok - ' || p_message;
    end if;
    raise exception 'FAIL: % (expected SQLSTATE %, got % — %)', p_message, p_errcode, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (expected an error, statement succeeded)', p_message;
end;
$$;

create function tests.lives(p_sql text, p_message text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'ok - ' || p_message;
exception when others then
  raise exception 'FAIL: % (% — %)', p_message, sqlstate, sqlerrm;
end;
$$;

-- A complete, submittable listing for a user: chassis, 3 photos, a dashboard photo.
-- Runs as the superuser; returns the listing id.
create function tests.ready_listing(
  p_seller text,
  p_chassis text,
  p_mileage integer default 84000,
  p_model integer default null
)
returns uuid
language plpgsql
as $$
declare
  new_id uuid;
begin
  insert into public.listings (seller_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code)
  values (tests.id(p_seller), coalesce(p_model, tests.model_id('toyota', 'corolla-axio')), 2016, p_mileage,
          1350000, 'foreign_used', 'saloon', 'petrol', 'automatic', 1)
  returning id into new_id;
  insert into public.listing_identity (listing_id, chassis_number) values (new_id, p_chassis);
  insert into public.listing_media (listing_id, storage_path, thumb_path, position)
  select new_id, new_id || '/p' || i || '.webp', new_id || '/p' || i || '_thumb.webp', i
    from generate_series(0, 2) i;
  insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes, uploaded_by)
  values (new_id, 'odometer_photo', new_id || '/odometer.jpg', 'image/jpeg', 2048, tests.id(p_seller));
  return new_id;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
