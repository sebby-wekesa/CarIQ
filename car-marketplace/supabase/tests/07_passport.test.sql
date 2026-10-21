-- Vehicle Passport: chassis linking, privacy, submission checks, readings, flags, review.
begin;

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.create_user('bob', '+254722000002', 'Bob Otieno');
select tests.create_user('carol', '+254733000003', 'Carol Mwende');
select tests.create_user('admin', '+254700000099', 'Site Admin');
update public.profiles set role = 'admin', county_code = 1 where id = tests.id('admin');
update public.profiles set county_code = 1 where id = tests.id('alice');

-- Starting a listing ------------------------------------------------------------------
select tests.authenticate_as('alice');
insert into tests.fixtures
select 'a1', public.start_listing(tests.model_id('toyota', 'corolla-axio'), 2016, ' nze141 - 1234567 ');

select tests.eq((select status::text from public.listings where id = tests.fx('a1')), 'draft',
  'start_listing creates a draft');
select tests.eq((select county_code from public.listings where id = tests.fx('a1')), 1::smallint,
  'the draft starts in the seller''s county');
select tests.eq((select body_type::text from public.listings where id = tests.fx('a1')), 'saloon',
  'the body type defaults from the model');
select tests.eq((select chassis_number from public.listing_identity where listing_id = tests.fx('a1')),
  'NZE141-1234567', 'the chassis number is stored in a clean format');
select tests.eq(
  (select v.chassis_masked from public.vehicles v join public.listings l on l.vehicle_id = v.id
    where l.id = tests.fx('a1')),
  'NZE141-12•••67', 'the vehicle shows a masked chassis');
select tests.eq(
  (select v.model_code from public.vehicles v join public.listings l on l.vehicle_id = v.id
    where l.id = tests.fx('a1')),
  'NZE141', 'the model code is read from the frame number');

select tests.throws($$ select public.start_listing(1, 2016, 'not a chassis') $$, '23514',
  'an invalid chassis number is rejected');
select tests.throws($$ select chassis_key from public.vehicles $$, '42501',
  'the full chassis key is not readable through the API');

-- Identity is private ---------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq((select count(*)::int from public.listing_identity), 0, 'other users cannot read chassis or plate');
select tests.throws(format($$ insert into public.listing_identity (listing_id, chassis_number)
                              values (%L, 'GP5-7654321') $$, tests.fx('a1')),
  '42501', 'nobody can attach an identity to someone else''s listing');

select tests.as_superuser();
select tests.as_anon();
select tests.throws($$ select * from public.listing_identity $$, '42501', 'anon has no access to listing identity');
select tests.eq((select count(*)::int from public.vehicles), 1, 'anon can see vehicle summaries');

-- Same car, typed differently, is the same Passport --------------------------------------
select tests.as_superuser();
select tests.authenticate_as('bob');
insert into tests.fixtures
select 'b1', public.start_listing(tests.model_id('toyota', 'corolla-axio'), 2016, 'NZE1411234567');
select tests.as_superuser();
select tests.eq(
  (select vehicle_id from public.listings where id = tests.fx('b1')),
  (select vehicle_id from public.listings where id = tests.fx('a1')),
  'the same chassis typed without the hyphen links to the same vehicle');

-- Submission checks ---------------------------------------------------------------------------
select tests.authenticate_as('alice');
select tests.throws(format($$ update public.listings set status = 'pending_review' where id = %L $$, tests.fx('a1')),
  '23514', 'a draft without price and mileage cannot be submitted');
update public.listings
   set mileage_km = 84000, price_kes = 1350000, condition = 'foreign_used', fuel_type = 'petrol',
       transmission = 'automatic'
 where id = tests.fx('a1');
select tests.throws(format($$ update public.listings set status = 'pending_review' where id = %L $$, tests.fx('a1')),
  '23514', 'a listing needs 3 photos before it can be submitted');

insert into public.listing_media (listing_id, storage_path, thumb_path, position)
select tests.fx('a1'), tests.fx('a1') || '/p' || i || '.webp', tests.fx('a1') || '/p' || i || '_t.webp', i
  from generate_series(0, 2) i;
select tests.throws(format($$ update public.listings set status = 'pending_review' where id = %L $$, tests.fx('a1')),
  '23514', 'a listing needs a dashboard photo before it can be submitted');

select tests.throws(format($$ insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes)
                              values (%L, 'odometer_photo', 'elsewhere/odo.jpg', 'image/jpeg', 1000) $$, tests.fx('a1')),
  '42501', 'documents must be stored inside the listing''s folder');
select tests.lives(format($$ insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes)
                             values (%1$L, 'odometer_photo', %1$L || '/odo.jpg', 'image/jpeg', 1000) $$, tests.fx('a1')),
  'the seller uploads a dashboard photo');
select tests.lives(format($$ insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes)
                             values (%1$L, 'auction_sheet', %1$L || '/auction.jpg', 'image/jpeg', 1000) $$, tests.fx('a1')),
  'the seller uploads an auction sheet');
select tests.throws(format($$ update public.vehicle_documents set verification_level = 'verified'
                              where listing_id = %L $$, tests.fx('a1')),
  '42501', 'sellers cannot mark their own documents verified');
select tests.eq(
  (select vehicle_id from public.vehicle_documents where listing_id = tests.fx('a1') limit 1),
  (select vehicle_id from public.listings where id = tests.fx('a1')),
  'documents attach to the listing''s vehicle automatically');

select tests.eq(tests.rows(format($$ update public.listings set status = 'pending_review' where id = %L $$,
  tests.fx('a1'))), 1::bigint, 'a complete listing is submitted for review');
select tests.throws(format($$ update public.listing_identity set chassis_number = 'GP5-7654321' where listing_id = %L $$,
  tests.fx('a1')), '42501', 'the chassis number is locked once submitted');

select tests.as_superuser();
select tests.eq(
  (select reading_km || '/' || source || '/' || verification_level from public.odometer_readings
    where listing_id = tests.fx('a1')),
  '84000/listing/provided', 'submitting records a mileage reading backed by the dashboard photo');

-- Other users cannot see Passport documents -----------------------------------------------
select tests.authenticate_as('carol');
select tests.eq((select count(*)::int from public.vehicle_documents), 0, 'buyers cannot open sellers'' documents');
select tests.throws(format($$ insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes)
                              values (%1$L, 'auction_sheet', %1$L || '/fake.jpg', 'image/jpeg', 1000) $$, tests.fx('a1')),
  '42501', 'nobody can add documents to someone else''s listing');
select tests.eq((select public.listing_passport(tests.fx('a1'))), null::jsonb,
  'a listing under review has no public Passport');

-- Review ------------------------------------------------------------------------------------
select tests.throws(format($$ select public.admin_review_listing(%L, 'approve') $$, tests.fx('a1')),
  '42501', 'only admins can approve listings');

select tests.as_superuser();
select tests.authenticate_as('admin');
select tests.throws(format($$ select public.admin_review_listing(%L, 'reject', '  ') $$, tests.fx('a1')),
  '22023', 'a rejection needs a reason');
select tests.eq((select count(*)::int from public.listing_identity where listing_id = tests.fx('a1')), 1,
  'admins can read the full chassis number to check it');
select tests.lives(format($$ select public.admin_review_listing(%L, 'approve') $$, tests.fx('a1')),
  'an admin approves the listing');
select tests.throws(format($$ select public.admin_review_listing(%L, 'approve') $$, tests.fx('a1')),
  'P0002', 'a listing cannot be approved twice');
select tests.eq((select count(*)::int from public.audit_log where target_id = tests.fx('a1')), 1,
  'the approval is written to the audit log');

-- Public Passport ----------------------------------------------------------------------------
select tests.as_superuser();
select tests.as_anon();
select tests.eq((select is_public from public.listing_overview where id = tests.fx('a1')), true,
  'the approved listing is public');
select tests.eq((select jsonb_array_length(public.listing_passport(tests.fx('a1')) -> 'documents')), 2,
  'the public Passport lists the documents provided');
select tests.eq((select public.listing_passport(tests.fx('a1')) #>> '{documents,0,verification_level}'), 'provided',
  'documents are shown as provided, not verified');
select tests.eq((select public.listing_passport(tests.fx('a1')) #>> '{vehicle,chassis_masked}'), 'NZE141-12•••67',
  'the Passport shows the masked chassis');
select tests.ok((select public.listing_passport(tests.fx('a1'))::text not like '%storage_path%'),
  'the public Passport never exposes file paths');

-- One active listing per car ------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('bob');
update public.listings
   set mileage_km = 60000, price_kes = 1200000, condition = 'locally_used', fuel_type = 'petrol',
       transmission = 'automatic', county_code = 47
 where id = tests.fx('b1');
insert into public.listing_media (listing_id, storage_path, position)
select tests.fx('b1'), tests.fx('b1') || '/p' || i || '.webp', i from generate_series(0, 2) i;
insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes)
values (tests.fx('b1'), 'odometer_photo', tests.fx('b1') || '/odo.jpg', 'image/jpeg', 1000);
insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes)
values (tests.fx('b1'), 'logbook', tests.fx('b1') || '/logbook.pdf', 'application/pdf', 1000);
select tests.throws(format($$ update public.listings set status = 'pending_review' where id = %L $$, tests.fx('b1')),
  '23505', 'the same car cannot be on sale twice at once');

-- Alice sells; Bob relists the same car with less mileage --------------------------------------
select tests.as_superuser();
select tests.authenticate_as('alice');
update public.listings set status = 'sold' where id = tests.fx('a1');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.lives(format($$ update public.listings set status = 'pending_review' where id = %L $$, tests.fx('b1')),
  'once sold, the car can be listed again by its new owner');
select tests.eq((select count(*)::int from public.vehicle_flags), 0, 'sellers cannot see flags');

select tests.as_superuser();
select tests.eq(
  (select kind || ':' || (detail ->> 'previous_km') || '->' || (detail ->> 'new_km')
     from public.vehicle_flags where vehicle_id = (select vehicle_id from public.listings where id = tests.fx('b1'))),
  'mileage_decrease:84000->60000', 'a lower reading than the car''s history raises a mileage flag');

select tests.authenticate_as('admin');
select tests.eq((select count(*)::int from public.vehicle_flags where status = 'open'), 1, 'admins see open flags');
select tests.lives(format($$ select public.admin_review_listing(%L, 'approve') $$, tests.fx('b1')),
  'the admin approves the relisting');

select tests.as_superuser();
select tests.as_anon();
select tests.eq((select jsonb_array_length(public.listing_passport(tests.fx('b1')) -> 'readings')), 2,
  'the Passport keeps the earlier seller''s published reading');
select tests.eq((select jsonb_array_length(public.listing_passport(tests.fx('b1')) -> 'documents')), 2,
  'unchecked documents from the earlier listing stay off the new listing''s Passport');

-- Photos ----------------------------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('alice');
insert into tests.fixtures
select 'a2', public.start_listing(tests.model_id('mazda', 'demio'), 2015, 'DJ3FS-123456');
insert into public.listing_media (listing_id, storage_path, position)
select tests.fx('a2'), tests.fx('a2') || '/p' || i || '.webp', i from generate_series(0, 19) i;
select tests.throws(format($$ insert into public.listing_media (listing_id, storage_path, position)
                              values (%1$L, %1$L || '/p20.webp', 20) $$, tests.fx('a2')),
  '23514', 'a listing holds at most 20 photos');

select tests.lives(format($$ select public.reorder_listing_media(%1$L,
  array(select id from public.listing_media where listing_id = %1$L order by position desc)) $$, tests.fx('a2')),
  'the seller reorders photos');
select tests.eq(
  (select storage_path from public.listing_media where listing_id = tests.fx('a2') and position = 0),
  tests.fx('a2') || '/p19.webp', 'the last photo is now the cover');

select tests.as_superuser();
select tests.authenticate_as('bob');
select public.reorder_listing_media(tests.fx('a2'),
  array(select id from public.listing_media where listing_id = tests.fx('a2')));
select tests.as_superuser();
select tests.eq(
  (select storage_path from public.listing_media where listing_id = tests.fx('a2') and position = 0),
  tests.fx('a2') || '/p19.webp', 'other users cannot reorder someone else''s photos');

-- Expiry -------------------------------------------------------------------------------------------
select tests.authenticate_as('alice');
select tests.throws($$ select public.expire_due_listings() $$, '42501', 'users cannot run the expiry job');
select tests.as_superuser();
update public.listings set expires_at = now() - interval '1 day' where id = tests.fx('b1');
select tests.as_anon();
select tests.eq((select is_public from public.listing_overview where id = tests.fx('b1')), false,
  'an overdue listing drops out of public results before the job runs');
select tests.as_superuser();
select tests.as_service();
select tests.eq((select public.expire_due_listings()), 1, 'the scheduled job expires overdue listings');

rollback;
