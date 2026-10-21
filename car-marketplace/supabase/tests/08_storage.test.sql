-- Storage policies: files live under "<listing id>/" and follow the listing's owner.
begin;

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.create_user('bob', '+254722000002', 'Bob Otieno');
select tests.create_user('admin', '+254700000099', 'Site Admin');
update public.profiles set role = 'admin' where id = tests.id('admin');

select tests.authenticate_as('alice');
insert into tests.fixtures
select 'a1', public.start_listing(tests.model_id('toyota', 'vitz'), 2015, 'KSP130-2012345');

select tests.lives(format($$ insert into storage.objects (bucket_id, name) values ('listing-photos', %L || '/one.webp') $$,
  tests.fx('a1')), 'the owner uploads a photo into the listing folder');
select tests.lives(format($$ insert into storage.objects (bucket_id, name) values ('vehicle-documents', %L || '/auction.jpg') $$,
  tests.fx('a1')), 'the owner uploads a document into the listing folder');
select tests.throws($$ insert into storage.objects (bucket_id, name) values ('listing-photos', 'not-a-listing/one.webp') $$,
  '42501', 'uploads outside a listing folder are refused');
select tests.throws($$ insert into storage.objects (bucket_id, name) values ('listing-photos', 'loose.webp') $$,
  '42501', 'uploads at the bucket root are refused');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.throws(format($$ insert into storage.objects (bucket_id, name) values ('listing-photos', %L || '/evil.webp') $$,
  tests.fx('a1')), '42501', 'nobody can upload into someone else''s listing');
select tests.eq((select count(*)::int from storage.objects where bucket_id = 'vehicle-documents'), 0,
  'other users cannot see document files');
select tests.eq(tests.rows(format($$ delete from storage.objects where name like %L $$, tests.fx('a1') || '/%')),
  0::bigint, 'other users cannot delete someone else''s files');

select tests.as_superuser();
select tests.as_anon();
select tests.throws($$ insert into storage.objects (bucket_id, name) values ('listing-photos', 'x/y.webp') $$,
  '42501', 'anon cannot upload');

select tests.as_superuser();
select tests.authenticate_as('admin');
select tests.eq((select count(*)::int from storage.objects where bucket_id = 'vehicle-documents'), 1,
  'admins can read document files to review them');

select tests.as_superuser();
select tests.authenticate_as('alice');
select tests.eq(tests.rows(format($$ delete from storage.objects where bucket_id = 'listing-photos' and name = %L $$,
  tests.fx('a1') || '/one.webp')), 1::bigint, 'the owner can delete their photo');

select tests.as_superuser();
select tests.eq((select public from storage.buckets where id = 'listing-photos'), true, 'listing photos are public');
select tests.eq((select public from storage.buckets where id = 'vehicle-documents'), false, 'documents are private');

rollback;
