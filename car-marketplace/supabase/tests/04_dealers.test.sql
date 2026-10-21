-- Dealers: registration, approval, KYC privacy, staff, dealer stock.
begin;

select tests.create_user('bob', '+254722000002', 'Bob Otieno');
select tests.create_user('carol', '+254733000003', 'Carol Mwende');
select tests.create_user('dave', '+254744000004', 'Dave Kamau');

-- Bob registers a dealer -------------------------------------------------------
select tests.authenticate_as('bob');
select tests.throws($$ insert into public.dealers (name, slug, county_code) values ('Coast Auto Yard', 'coast-auto-yard', 1) $$,
  '42501', 'dealers are registered through apply_dealer, not inserted directly');
select tests.throws($$ select public.apply_dealer('Coast Auto Yard', 1, 'Mombasa', '+254722000002', 'P051234567X') $$,
  '23514', 'the profile needs a county before registering a dealer');

select tests.as_superuser();
update public.profiles set county_code = 1 where id in (tests.id('bob'), tests.id('dave'));
select tests.authenticate_as('bob');
select tests.throws($$ select public.apply_dealer('Coast Auto Yard', 1, 'Mombasa', '+254722000002', 'NOTAPIN') $$,
  '23514', 'an invalid KRA PIN is rejected');
insert into tests.fixtures
select 'yard', public.apply_dealer('Coast Auto Yard', 1, 'Mombasa', '+254722000002', 'p051234567x', 'pvt-abc123');

select tests.eq((select slug from public.dealers where id = tests.fx('yard')), 'coast-auto-yard',
  'the dealer page address comes from the business name');
select tests.eq((select status::text from public.dealers where id = tests.fx('yard')), 'pending',
  'new dealers start pending');
select tests.eq((select role::text from public.dealer_members
                  where dealer_id = tests.fx('yard') and profile_id = tests.id('bob')), 'owner',
  'whoever registers a dealer becomes its owner');
select tests.eq((select kra_pin || ' ' || business_reg_no from public.dealer_kyc where dealer_id = tests.fx('yard')),
  'P051234567X PVT-ABC123', 'KRA PIN and registration number are stored in capitals');
select tests.throws(format($$ update public.dealers set status = 'approved' where id = %L $$, tests.fx('yard')),
  '42501', 'a dealer cannot approve itself');
select tests.throws(format($$ update public.dealers set trusted = true where id = %L $$, tests.fx('yard')),
  '42501', 'a dealer cannot mark itself trusted');
select tests.throws(format($$ update public.dealers set plan_id = 'dealer_pro' where id = %L $$, tests.fx('yard')),
  '42501', 'a dealer cannot give itself a paid plan');
select tests.eq(tests.rows(format($$ update public.dealers set description = 'Japanese imports', opening_hours = 'Mon-Sat 8-6'
  where id = %L $$, tests.fx('yard'))), 1::bigint, 'the owner can edit the dealer profile');

-- KYC -----------------------------------------------------------------------------
select tests.eq(tests.rows(format($$ update public.dealer_kyc set kra_pin = 'P051234568Y' where dealer_id = %L $$,
  tests.fx('yard'))), 1::bigint, 'the owner can correct the KRA PIN before approval');
select tests.throws(format($$ update public.dealer_kyc set reviewed_at = now() where dealer_id = %L $$,
  tests.fx('yard')), '42501', 'the owner cannot mark their own KYC as reviewed');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.eq((select count(*)::int from public.dealer_kyc), 0, 'outsiders cannot read dealer KYC');
select tests.eq((select count(*)::int from public.dealers where id = tests.fx('yard')), 0,
  'a pending dealer is hidden from the public');

select tests.as_superuser();
select tests.as_anon();
select tests.throws($$ select kra_pin from public.dealer_kyc $$, '42501', 'anon has no access to KYC at all');

-- Approval (service role, as the admin console will do) -------------------------------
select tests.as_superuser();
select tests.as_service();
update public.dealers set status = 'approved', verified_at = now() where id = tests.fx('yard');

select tests.as_superuser();
select tests.as_anon();
select tests.eq((select count(*)::int from public.dealers where id = tests.fx('yard')), 1,
  'an approved dealer is public');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.throws(format($$ update public.dealer_kyc set kra_pin = 'P051234569Z' where dealer_id = %L $$, tests.fx('yard')),
  '42501', 'verified details are locked once the dealer is approved');
select tests.throws(format($$ update public.dealers set name = 'Somebody Else Motors' where id = %L $$, tests.fx('yard')),
  '42501', 'the verified business name is locked too');
select tests.eq(tests.rows(format($$ update public.dealers set town = 'Bamburi' where id = %L $$, tests.fx('yard'))),
  1::bigint, 'other showroom details can still change');

-- Staff ---------------------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.throws(format($$ insert into public.dealer_members (dealer_id, profile_id, role)
                             values (%L, %L, 'sales') $$, tests.fx('yard'), tests.id('carol')),
  '42501', 'staff are not inserted directly');
select tests.eq(public.invite_dealer_staff(tests.fx('yard'), '+254733000003', 'sales'), 'added',
  'the owner adds Carol as sales staff');
select tests.throws(format($$ update public.dealer_members set profile_id = %L where dealer_id = %L and profile_id = %L $$,
  tests.id('dave'), tests.fx('yard'), tests.id('carol')), '42501', 'a membership cannot be handed to someone else');
select tests.throws(format($$ delete from public.dealer_members where dealer_id = %L and profile_id = %L $$,
  tests.fx('yard'), tests.id('bob')), '23514', 'the last owner cannot remove themselves');
select tests.throws(format($$ update public.dealer_members set role = 'manager'
                              where dealer_id = %L and profile_id = %L $$, tests.fx('yard'), tests.id('bob')),
  '23514', 'the last owner cannot demote themselves');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.throws(format($$ insert into public.dealer_members (dealer_id, profile_id, role)
                              values (%L, %L, 'owner') $$, tests.fx('yard'), tests.id('dave')),
  '42501', 'sales staff cannot add people');
select tests.eq((select count(*)::int from public.dealer_kyc), 0, 'sales staff cannot read KYC');

-- Carol lists dealer stock -------------------------------------------------------------------
with l as (
  insert into public.listings (dealer_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code)
  values (tests.fx('yard'), tests.model_id('toyota', 'land-cruiser-prado'), 2017, 98000, 6200000,
          'foreign_used', 'suv', 'diesel', 'automatic', 1)
  returning id
)
insert into tests.fixtures select 'prado', id from l;
select tests.ok(tests.fx('prado') is not null, 'staff can list stock for an approved dealer');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq(tests.rows(format($$ update public.listings set price_kes = 6100000 where id = %L $$,
  tests.fx('prado'))), 1::bigint, 'the owner can edit stock listed by staff');

select tests.as_superuser();
select tests.authenticate_as('dave');
select tests.throws(format($$
  insert into public.listings (dealer_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code)
  values (%L, %s, 2017, 98000, 6200000, 'foreign_used', 'suv', 'diesel', 'automatic', 1)
$$, tests.fx('yard'), tests.model_id('toyota', 'land-cruiser-prado')),
  '42501', 'outsiders cannot list stock under a dealer');

-- Unapproved dealers cannot list -------------------------------------------------------------
insert into tests.fixtures select 'dave_motors', public.apply_dealer('Dave Motors', 47, 'Nairobi', null, 'A012345678B');
select tests.throws(format($$
  insert into public.listings (dealer_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code)
  values (%L, %s, 2015, 120000, 900000, 'foreign_used', 'hatchback', 'petrol', 'automatic', 47)
$$, tests.fx('dave_motors'), tests.model_id('toyota', 'vitz')),
  '42501', 'a pending dealer cannot list stock yet');

-- Subscriptions are read-only to dealers ---------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.throws(format($$
  insert into public.subscriptions (dealer_id, plan_id, current_period_start, current_period_end)
  values (%L, 'dealer_pro', now(), now() + interval '1 month')
$$, tests.fx('yard')), '42501', 'dealers cannot create their own subscription');

rollback;
