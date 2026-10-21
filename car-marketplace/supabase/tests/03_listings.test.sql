-- Listings: who can see, create and change them, and the status rules.
begin;

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.create_user('bob', '+254722000002', 'Bob Otieno');
select tests.create_user('admin', '+254700000099', 'Site Admin');
update public.profiles set role = 'admin' where id = tests.id('admin');

-- Alice creates a draft ------------------------------------------------------
select tests.authenticate_as('alice');

with new_listing as (
  insert into public.listings (model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code, town, description)
  values (tests.model_id('toyota', 'corolla-axio'), 2016, 84000, 1350000, 'foreign_used', 'saloon',
          'petrol', 'automatic', 1, 'Nyali', 'Clean, accident free')
  returning id
)
insert into tests.fixtures select 'axio', id from new_listing;

select tests.eq((select seller_id from public.listings where id = tests.fx('axio')), tests.id('alice'),
  'the seller is always the signed-in user');
select tests.eq((select status::text from public.listings where id = tests.fx('axio')), 'draft',
  'new listings start as drafts');

select tests.throws($$
  insert into public.listings (model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code, status)
  values (tests.model_id('toyota', 'vitz'), 2015, 90000, 700000, 'foreign_used', 'hatchback',
          'petrol', 'automatic', 1, 'live')
$$, '42501', 'a seller cannot publish straight to live');

select tests.throws($$
  insert into public.listings (seller_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code)
  values (tests.id('bob'), tests.model_id('toyota', 'vitz'), 2015, 90000, 700000, 'foreign_used',
          'hatchback', 'petrol', 'automatic', 1)
$$, '42501', 'a seller cannot create a listing in someone else''s name');

select tests.throws($$
  insert into public.listings (model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code)
  values (tests.model_id('toyota', 'vitz'), 2015, 90000, 50, 'foreign_used', 'hatchback',
          'petrol', 'automatic', 1)
$$, '23514', 'prices below KSh 10,000 are rejected');

-- Drafts are private -----------------------------------------------------------
select tests.as_superuser();
select tests.as_anon();
select tests.eq((select count(*)::int from public.listings where id = tests.fx('axio')), 0,
  'anon cannot see a draft');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq((select count(*)::int from public.listings where id = tests.fx('axio')), 0,
  'other users cannot see a draft');
select tests.eq(tests.rows(format($$ update public.listings set price_kes = 1 where id = %L $$, tests.fx('axio'))),
  0::bigint, 'other users cannot edit the listing');
select tests.eq(tests.rows(format($$ delete from public.listings where id = %L $$, tests.fx('axio'))),
  0::bigint, 'other users cannot delete the listing');

-- Review flow --------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('alice');
select tests.throws(format($$ update public.listings set status = 'pending_review' where id = %L $$, tests.fx('axio')),
  '23514', 'a listing without chassis, photos and dashboard photo cannot be submitted');
select tests.lives(format($$ insert into public.listing_identity (listing_id, chassis_number)
                             values (%L, 'NZE141-1234567') $$, tests.fx('axio')),
  'the seller adds the chassis number');
select tests.lives(format($$ insert into public.listing_media (listing_id, storage_path, thumb_path, position)
                             select %1$L, %1$L || '/p' || i || '.webp', %1$L || '/p' || i || '_t.webp', i
                               from generate_series(0, 2) i $$, tests.fx('axio')),
  'the seller adds three photos');
select tests.lives(format($$ insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes)
                             values (%1$L, 'odometer_photo', %1$L || '/odo.jpg', 'image/jpeg', 1000) $$, tests.fx('axio')),
  'the seller adds a dashboard photo');
select tests.eq(tests.rows(format($$ update public.listings set status = 'pending_review' where id = %L $$,
  tests.fx('axio'))), 1::bigint, 'the seller submits the draft for review');
select tests.throws(format($$ update public.listings set status = 'live' where id = %L $$, tests.fx('axio')),
  '42501', 'the seller cannot approve their own listing');
select tests.throws(format($$ update public.listings set boosted_until = now() + interval '7 days' where id = %L $$,
  tests.fx('axio')), '42501', 'the seller cannot give themselves a free boost');
select tests.throws(format($$ update public.listings set view_count = 9999 where id = %L $$, tests.fx('axio')),
  '42501', 'the seller cannot inflate views');

select tests.as_superuser();
select tests.authenticate_as('admin');
select tests.eq(tests.rows(format($$ update public.listings set status = 'live' where id = %L $$,
  tests.fx('axio'))), 1::bigint, 'an admin approves the listing');

select tests.as_superuser();
select tests.ok((select published_at is not null and expires_at > now() + interval '59 days'
                   from public.listings where id = tests.fx('axio')),
  'going live sets published_at and a 60-day expiry');

-- Live listings are public ---------------------------------------------------------
select tests.as_anon();
select tests.eq((select count(*)::int from public.listings where id = tests.fx('axio')), 1,
  'anon can see a live listing');
select tests.throws(format($$ update public.listings set price_kes = 1 where id = %L $$, tests.fx('axio')),
  '42501', 'anon cannot edit listings');

-- Seller lifecycle ------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('alice');
select tests.eq(tests.rows(format($$ update public.listings set price_kes = 1290000 where id = %L $$,
  tests.fx('axio'))), 1::bigint, 'the seller can drop the price on a live listing');
select tests.eq(tests.rows(format($$ update public.listings set status = 'paused' where id = %L $$,
  tests.fx('axio'))), 1::bigint, 'the seller can pause a live listing');
select tests.eq(tests.rows(format($$ update public.listings set status = 'live' where id = %L $$,
  tests.fx('axio'))), 1::bigint, 'the seller can reactivate a paused listing');
select tests.eq(tests.rows(format($$ update public.listings set status = 'sold' where id = %L $$,
  tests.fx('axio'))), 1::bigint, 'the seller can mark it sold');
select tests.ok((select sold_at is not null from public.listings where id = tests.fx('axio')),
  'marking sold records sold_at');
select tests.throws(format($$ update public.listings set status = 'live' where id = %L $$, tests.fx('axio')),
  '42501', 'a sold listing cannot be relisted as live');

select tests.eq(tests.rows(format($$ delete from public.listings where id = %L $$, tests.fx('axio'))),
  0::bigint, 'a submitted listing cannot be deleted, only paused or marked sold');

with draft as (
  insert into public.listings (model_id, year) values (tests.model_id('toyota', 'vitz'), 2015) returning id
)
insert into tests.fixtures select 'vitz_draft', id from draft;
select tests.eq(tests.rows(format($$ delete from public.listings where id = %L $$, tests.fx('vitz_draft'))),
  1::bigint, 'a draft can be started with just model and year, and deleted');

-- Media follows the listing ------------------------------------------------------------
select tests.lives(format($$ insert into public.listing_media (listing_id, storage_path, position)
                             values (%L, 'listings/axio/1.jpg', 0) $$, tests.fx('axio')),
  'the seller can attach photos');
select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.throws(format($$ insert into public.listing_media (listing_id, storage_path, position)
                              values (%L, 'listings/axio/evil.jpg', 1) $$, tests.fx('axio')),
  '42501', 'other users cannot attach photos to someone else''s listing');

rollback;
