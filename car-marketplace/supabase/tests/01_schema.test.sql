-- Structure and reference data.
begin;

select tests.eq(
  (select count(*)::int from pg_tables t
     join pg_class c on c.relname = t.tablename
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
    where t.schemaname = 'public' and not c.relrowsecurity),
  0,
  'every public table has row-level security enabled'
);

select tests.eq(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  33,
  'schema has 33 tables (23 from Sprint 0, 5 for the Vehicle Passport, 2 for notifications, 3 for dealers)'
);

select tests.eq((select count(*)::int from public.counties), 47, 'all 47 counties are loaded');
select tests.eq((select name from public.counties where code = 1), 'Mombasa', 'county 001 is Mombasa');
select tests.eq((select name from public.counties where code = 47), 'Nairobi', 'county 047 is Nairobi');

select tests.ok((select count(*) from public.makes) >= 30, 'at least 30 makes are loaded');
select tests.ok((select count(*) from public.models) >= 250, 'at least 250 models are loaded');
select tests.eq(
  (select name from public.makes order by sort_order, name limit 1),
  'Toyota',
  'Toyota sorts first'
);
select tests.ok(
  exists (select 1 from public.models m join public.makes mk on mk.id = m.make_id
           where mk.slug = 'toyota' and m.slug = 'land-cruiser-prado' and m.body_type = 'suv'),
  'Toyota Land Cruiser Prado is in the catalogue as an SUV'
);
select tests.eq(
  (select count(*)::int from public.makes where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    + (select count(*)::int from public.models where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  0,
  'every make and model slug is URL-safe'
);
select tests.eq((select count(*)::int from public.plans where is_active), 3, 'three dealer plans are active');

-- Reference data is readable but not writable through the API.
select tests.as_anon();
select tests.ok((select count(*) from public.models) >= 250, 'anon can read the catalogue');
select tests.throws($$ insert into public.makes (name, slug) values ('Fake', 'fake') $$, '42501',
  'anon cannot add makes');
select tests.as_superuser();

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.authenticate_as('alice');
select tests.throws($$ update public.plans set price_kes = 1 $$, '42501', 'users cannot change plan prices');
select tests.throws($$ delete from public.counties $$, '42501', 'users cannot delete counties');

rollback;
