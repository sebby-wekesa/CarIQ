-- Profiles: created on sign-up; names public; phone and role private.
begin;

-- Supabase Auth stores phone numbers without the leading +.
select tests.create_user('alice', '254711000001', 'Alice Wanjiru');
select tests.create_user('bob', '+254722000002');

select tests.eq((select phone from public.profiles where id = tests.id('alice')), '+254711000001',
  'sign-up creates a profile with the phone in E.164');
select tests.eq((select full_name from public.profiles where id = tests.id('alice')), 'Alice Wanjiru',
  'full_name from sign-up metadata is copied to the profile');
select tests.eq((select role::text from public.profiles where id = tests.id('bob')), 'user',
  'new users are plain users');

-- Changing the number in Auth keeps the profile in step.
update auth.users set phone = '254733000002' where id = tests.id('bob');
select tests.eq((select phone from public.profiles where id = tests.id('bob')), '+254733000002',
  'a phone change in Auth updates the profile');

-- Anonymous visitors
select tests.as_anon();
select tests.eq((select full_name from public.profiles where id = tests.id('alice')), 'Alice Wanjiru',
  'anyone can read a seller''s name');
select tests.throws($$ select phone from public.profiles $$, '42501', 'anon cannot read phone numbers');
select tests.throws($$ select role from public.profiles $$, '42501', 'anon cannot read roles');
select tests.throws($$ update public.profiles set full_name = 'Hacked' $$, '42501', 'anon cannot edit profiles');

-- Signed in as Bob
select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq(tests.rows($$ update public.profiles set full_name = 'Bob Otieno', county_code = 1
                              where id = tests.id('bob') $$), 1::bigint,
  'a user can edit their own name and county');
select tests.eq(tests.rows($$ update public.profiles set full_name = 'Hacked'
                              where id = tests.id('alice') $$), 0::bigint,
  'a user cannot edit someone else''s profile');
select tests.throws($$ update public.profiles set role = 'admin' where id = tests.id('bob') $$, '42501',
  'a user cannot make themselves admin');
select tests.throws($$ update public.profiles set phone = '+254700000000' where id = tests.id('bob') $$, '42501',
  'a user cannot change their phone outside Auth');
select tests.throws($$ select phone from public.profiles where id = tests.id('bob') $$, '42501',
  'even your own phone comes from the Auth session, not the profiles table');
select tests.throws($$ update public.profiles set county_code = 99 where id = tests.id('bob') $$, '23503',
  'county must be one of the 47');
select tests.eq((select public.current_user_is_admin()), false, 'Bob is not an admin');

-- Admins
select tests.as_superuser();
update public.profiles set role = 'admin' where id = tests.id('alice');
select tests.authenticate_as('alice');
select tests.eq((select public.current_user_is_admin()), true, 'Alice is reported as admin once promoted');

rollback;
