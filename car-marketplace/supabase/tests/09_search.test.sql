-- Search, favourites, saved searches and their alerts.
begin;

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.create_user('bob', '+254722000002', 'Bob Otieno');
select tests.create_user('carol', '+254733000003', 'Carol Mwangi');

-- A small market, inserted live by the system (as approval would leave it).
create function pg_temp.live(
  p_name text, p_seller text, p_make text, p_model text, p_year int, p_price bigint, p_km int,
  p_county int, p_body text, p_fuel text, p_gearbox text, p_condition text, p_age interval,
  p_description text default null
) returns void language sql as $$
  with l as (
    insert into public.listings (seller_id, model_id, year, mileage_km, price_kes, condition, body_type,
                                 fuel_type, transmission, county_code, description, status, published_at)
    values (tests.id(p_seller), tests.model_id(p_make, p_model), p_year, p_km, p_price,
            p_condition::public.vehicle_condition, p_body::public.body_type, p_fuel::public.fuel_type,
            p_gearbox::public.transmission, p_county, p_description, 'live', now() - p_age)
    returning id
  )
  insert into tests.fixtures select p_name, id from l;
$$;

select pg_temp.live('axio',   'alice', 'toyota', 'corolla-axio', 2016, 1350000,  84000,  1, 'saloon', 'petrol', 'automatic', 'foreign_used', '3 days', 'Pearl white, one owner');
select pg_temp.live('vitz',   'alice', 'toyota', 'vitz',         2015,  720000,  96000,  1, 'hatchback', 'petrol', 'automatic', 'foreign_used', '2 days');
select pg_temp.live('prado',  'bob',   'toyota', 'land-cruiser-prado', 2014, 5200000, 140000, 1, 'suv', 'diesel', 'automatic', 'locally_used', '1 day');
select pg_temp.live('fielder','bob',   'toyota', 'corolla-fielder', 2017, 1450000, 61000, 47, 'station_wagon', 'petrol', 'cvt', 'foreign_used', '5 hours');
select pg_temp.live('demio',  'bob',   'mazda',  'demio',        2016,  850000,  70000,  1, 'hatchback', 'petrol', 'automatic', 'foreign_used', '1 hour', '100% genuine mileage');

-- A draft and an expired car never show up in search.
select pg_temp.live('expired','alice', 'toyota', 'vitz', 2014, 650000, 120000, 1, 'hatchback', 'petrol', 'automatic', 'foreign_used', '70 days');
update public.listings set expires_at = now() - interval '1 day' where id = tests.fx('expired');
with d as (
  insert into public.listings (seller_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code)
  values (tests.id('alice'), tests.model_id('toyota', 'vitz'), 2013, 99000, 600000, 'foreign_used', 'hatchback',
          'petrol', 'automatic', 1)
  returning id
)
insert into tests.fixtures select 'draft', id from d;

create function pg_temp.found(p_filters jsonb) returns text language sql as $$
  select coalesce(string_agg(f.name, ',' order by f.name), '')
    from public.search_listings(p_filters) r
    join tests.fixtures f on f.id = r.id;
$$;

-- Search ---------------------------------------------------------------------
select tests.as_anon();
select tests.eq(pg_temp.found('{}'), 'axio,demio,fielder,prado,vitz', 'no filters: every live car, nothing else');
select tests.eq(pg_temp.found('{"make":"toyota","price_max":1500000,"county":"mombasa"}'), 'axio,vitz',
  'Toyota under KSh 1.5M in Mombasa');
select tests.eq(pg_temp.found('{"make":"toyota","model":"corolla-axio"}'), 'axio', 'make and model');
select tests.eq(pg_temp.found('{"county":"nairobi"}'), 'fielder', 'county');
select tests.eq(pg_temp.found('{"price_min":1000000,"price_max":2000000}'), 'axio,fielder', 'price band');
select tests.eq(pg_temp.found('{"year_min":2016}'), 'axio,demio,fielder', 'year from');
select tests.eq(pg_temp.found('{"year_min":2015,"year_max":2016}'), 'axio,demio,vitz', 'year range');
select tests.eq(pg_temp.found('{"mileage_max":80000}'), 'demio,fielder', 'mileage up to');
select tests.eq(pg_temp.found('{"body":["suv","station_wagon"]}'), 'fielder,prado', 'any of several body types');
select tests.eq(pg_temp.found('{"fuel":["diesel"]}'), 'prado', 'fuel');
select tests.eq(pg_temp.found('{"transmission":["cvt","manual"]}'), 'fielder', 'gearbox');
select tests.eq(pg_temp.found('{"condition":["locally_used"]}'), 'prado', 'condition');
select tests.eq(pg_temp.found('{"q":"white axio"}'), 'axio', 'text search needs every word');
select tests.eq(pg_temp.found('{"q":"MAZDA"}'), 'demio', 'text search ignores case');
select tests.eq(pg_temp.found('{"q":"100%"}'), 'demio', 'a % in the text is matched literally');
select tests.eq(pg_temp.found('{"q":"10_%"}'), '', 'an _ in the text is matched literally');
select tests.eq(pg_temp.found('{"make":"toyota","fuel":["diesel"],"county":"nairobi"}'), '', 'filters combine with AND');

select tests.eq(
  (select string_agg(f.name, ',' order by r.price_kes) from public.search_listings('{"make":"toyota"}') r
     join tests.fixtures f on f.id = r.id),
  'vitz,axio,fielder,prado', 'callers sort the results');

select tests.ok(
  (select count(*) = 1 from public.listing_facets()
    where make_slug = 'toyota' and model_slug is null and county_slug = 'mombasa' and listings = 3),
  'facets count Toyota in Mombasa');
select tests.ok(
  (select count(*) = 1 from public.listing_facets()
    where make_slug is null and county_slug = 'nairobi' and county_name = 'Nairobi' and make_name is null
      and listings = 1),
  'facets count a county on its own');

select tests.as_superuser();
create function pg_temp.plan(p_sql text) returns text language plpgsql as $f$
declare
  line text;
  result text := '';
begin
  for line in execute 'explain ' || p_sql loop
    result := result || line || E'\n';
  end loop;
  return result;
end;
$f$;
select tests.ok(pg_temp.plan($$ select id from public.search_listings('{"make":"toyota"}')
                                 order by published_at desc limit 24 $$) !~ 'Function Scan',
  'search is inlined into the caller''s query, so sorting and paging use the indexes');
select tests.ok(pg_temp.plan($$ select r.id from (select '{"make":"toyota"}'::jsonb as f) a,
                                 lateral public.search_listings(a.f) r order by r.price_kes limit 24 $$) !~ 'Function Scan',
  'including when the filters arrive as a parameter, as PostgREST sends them');

-- Favourites -----------------------------------------------------------------
select tests.authenticate_as('carol');
select tests.lives(format($$ insert into public.favourites (listing_id) values (%L) $$, tests.fx('axio')),
  'a buyer saves a live car');
select tests.throws(format($$ insert into public.favourites (listing_id) values (%L) $$, tests.fx('draft')),
  '42501', 'a draft cannot be saved');
select tests.throws(format($$ insert into public.favourites (listing_id) values (%L) $$, tests.fx('expired')),
  '42501', 'an expired car cannot be saved');
select tests.throws(format($$ insert into public.favourites (profile_id, listing_id) values (%L, %L) $$,
  tests.id('bob'), tests.fx('vitz')), '42501', 'nobody saves cars onto someone else''s list');
select tests.throws(format($$ insert into public.favourites (listing_id) values (%L) $$, tests.fx('axio')),
  '23505', 'a car is saved once');
select tests.eq((select count(*)::int from public.my_favourites()), 1, 'the buyer sees their saved car');

select tests.as_superuser();
update public.listings set status = 'sold' where id = tests.fx('axio');
select tests.authenticate_as('carol');
select tests.eq((select status::text from public.my_favourites() where listing_id = tests.fx('axio')), 'sold',
  'a car sold after saving stays on the list, marked sold');
select tests.eq((select is_public from public.my_favourites() where listing_id = tests.fx('axio')), false,
  'and is no longer public');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq((select count(*)::int from public.favourites), 0, 'buyers cannot see each other''s favourites');
select tests.eq((select count(*)::int from public.my_favourites()), 0, 'or read them through the function');
select tests.eq(tests.rows(format($$ delete from public.favourites where listing_id = %L $$, tests.fx('axio'))),
  0::bigint, 'or delete them');

select tests.as_superuser();
select tests.as_anon();
select tests.throws(format($$ insert into public.favourites (listing_id) values (%L) $$, tests.fx('vitz')),
  '42501', 'signed-out visitors cannot save cars');
select tests.throws($$ select * from public.my_favourites() $$, '42501', 'or list favourites');

-- Saved searches ---------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('carol');
with s as (
  insert into public.saved_searches (name, filters)
  values ('Toyota, under KSh 1.5M, in Mombasa', '{"make":"toyota","price_max":1500000,"county":"mombasa"}')
  returning id
)
insert into tests.fixtures select 'search', id from s;

select tests.throws($$ insert into public.saved_searches (name, filters)
  values ('Again', '{"county":"mombasa","make":"toyota","price_max":1500000}') $$,
  '23505', 'the same search cannot be saved twice, whatever the key order');
select tests.throws($$ insert into public.saved_searches (name, filters) values ('Everything', '{}') $$,
  '23514', 'a search needs at least one filter');
select tests.throws($$ insert into public.saved_searches (name, filters) values ('Bad', '{"colour":"red"}') $$,
  '23514', 'unknown filter keys are refused');
select tests.throws($$ insert into public.saved_searches (name, filters) values ('Bad', '{"price_max":"cheap"}') $$,
  '23514', 'numbers must be numbers');
select tests.throws($$ insert into public.saved_searches (name, filters) values ('Bad', '{"body":["tank"]}') $$,
  '23514', 'enum values must exist');
select tests.throws($$ insert into public.saved_searches (name, filters) values ('Bad', '{"model":"vitz"}') $$,
  '23514', 'a model needs its make');
select tests.throws($$ insert into public.saved_searches (name, filters) values ('Bad', '{"make":"Toyota; drop"}') $$,
  '23514', 'slugs are slugs');
select tests.throws(format($$ update public.saved_searches set last_alerted_at = now() - interval '1 year' where id = %L $$,
  tests.fx('search')), '42501', 'buyers cannot rewind their alert clock');
select tests.lives(format($$ update public.saved_searches set alerts_enabled = false, name = 'Cheap Toyotas' where id = %L $$,
  tests.fx('search')), 'buyers rename searches and switch alerts off');
update public.saved_searches set alerts_enabled = true where id = tests.fx('search');

select tests.as_superuser();
update public.saved_searches set last_seen_at = now() - interval '2 days 12 hours' where id = tests.fx('search');
update public.listings set status = 'live' where id = tests.fx('axio');
select tests.authenticate_as('carol');
select tests.eq((select total_count from public.my_saved_searches()), 2::bigint, 'a saved search counts its matches');
select tests.eq((select new_count from public.my_saved_searches()), 1::bigint,
  'and how many are new since it was last opened');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq((select count(*)::int from public.my_saved_searches()), 0, 'saved searches are private');
select tests.throws(format($$ select * from public.open_saved_search(%L) $$, tests.fx('search')),
  'P0002', 'nobody else can open them');

-- Alerts -----------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.throws($$ select public.queue_saved_search_alerts() $$, '42501', 'buyers cannot run the alert job');

select tests.as_superuser();
update public.saved_searches set last_alerted_at = now() - interval '1 hour' where id = tests.fx('search');
select pg_temp.live('newvitz', 'bob', 'toyota', 'vitz', 2017, 980000, 45000, 1, 'hatchback', 'petrol', 'automatic',
  'foreign_used', '10 minutes');
select pg_temp.live('own', 'carol', 'toyota', 'vitz', 2017, 900000, 55000, 1, 'hatchback', 'petrol', 'automatic',
  'foreign_used', '10 minutes');
select pg_temp.live('pricey', 'bob', 'toyota', 'vitz', 2018, 1900000, 15000, 1, 'hatchback', 'petrol', 'automatic',
  'foreign_used', '10 minutes');
select pg_temp.live('recent', 'bob', 'toyota', 'passo', 2016, 690000, 72000, 1, 'hatchback', 'petrol', 'automatic',
  'foreign_used', '2 minutes');

select tests.as_service();
select tests.eq((select public.queue_saved_search_alerts()), 1, 'the job queues one alert for the matching search');
select tests.as_superuser();
select tests.eq((select payload ->> 'count' from public.notifications where saved_search_id = tests.fx('search')),
  '2', 'it counts only new matches from other sellers, within the filters');
select tests.eq((select payload -> 'listing_ids' from public.notifications where saved_search_id = tests.fx('search')),
  jsonb_build_array(tests.fx('recent'), tests.fx('newvitz')), 'and lists the new cars, newest first');

select tests.as_service();
select tests.eq((select public.queue_saved_search_alerts()), 0, 'a second run inside the overlap window does not repeat the alert');

select tests.as_superuser();
update public.saved_searches set alerts_enabled = false where id = tests.fx('search');
select pg_temp.live('later', 'bob', 'toyota', 'vitz', 2018, 1000000, 40000, 1, 'hatchback', 'petrol', 'automatic',
  'foreign_used', '1 minute');
select tests.as_service();
select tests.eq((select public.queue_saved_search_alerts()), 0, 'searches with alerts off are skipped');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.eq((select count(*)::int from public.notifications where read_at is null), 1, 'the buyer sees one unread alert');
select tests.throws(format($$ update public.notifications set read_at = now() where saved_search_id = %L $$,
  tests.fx('search')), '42501', 'alerts are not edited directly');
select tests.ok((select previously_seen_at < now() - interval '2 days' from public.open_saved_search(tests.fx('search'))),
  'opening a search returns when it was last seen');
select tests.eq((select count(*)::int from public.notifications where read_at is null), 0, 'and clears its alerts');
select tests.eq((select new_count from public.my_saved_searches()), 0::bigint, 'and its new count');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq((select count(*)::int from public.notifications), 0, 'nobody sees someone else''s alerts');

select tests.as_superuser();
select tests.as_anon();
select tests.throws($$ select count(*) from public.notifications $$, '42501', 'signed-out visitors have no alerts');
select tests.throws($$ select count(*) from private.saved_search_hits $$, '42501', 'the job''s bookkeeping is private');

-- Limits -----------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.throws($$
  insert into public.saved_searches (name, filters)
  select 'Search ' || i, jsonb_build_object('price_max', 100000 * i) from generate_series(1, 25) i $$,
  '23514', 'a buyer keeps at most 20 saved searches');

rollback;
