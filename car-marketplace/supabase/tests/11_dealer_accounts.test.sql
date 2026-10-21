-- Sprint 4: dealer onboarding and review, staff invites, the shared inbox, views, CSV import,
-- trusted publishing and the dealer dashboard.
begin;

select tests.create_user('bob', '+254722000002', 'Bob Otieno');
select tests.create_user('carol', '+254733000003', 'Carol Mwende');
select tests.create_user('dave', '+254744000004', 'Dave Kamau');
select tests.create_user('erin', '+254755000005', 'Erin Achieng');
select tests.create_user('admin', '+254700000099', 'Site Admin');
update public.profiles set role = 'admin' where id = tests.id('admin');
update public.profiles set county_code = 1 where id = tests.id('bob');

-- Application -------------------------------------------------------------------------------------
select tests.authenticate_as('bob');
insert into tests.fixtures
select 'yard', public.apply_dealer('Coast Auto Yard', 1, 'Mombasa', '+254722000002', 'P051234567X',
                                   p_address => 'Links Road, Nyali');
insert into tests.fixtures
select 'yard2', public.apply_dealer('Coast Auto Yard', 1, 'Malindi', '+254722000002', 'P051234567X');
select tests.eq((select slug from public.dealers where id = tests.fx('yard2')), 'coast-auto-yard-2',
  'a second dealer with the same name gets its own page address');

select tests.eq((select missing_documents from public.my_dealers() where id = tests.fx('yard')),
  array['kra_pin_certificate', 'business_registration', 'owner_id'],
  'the owner sees which documents are still needed');
select tests.throws(format($$ insert into public.dealer_documents (dealer_id, kind, storage_path, content_type, size_bytes)
                              values (%L, 'owner_id', 'elsewhere/id.jpg', 'image/jpeg', 1000) $$, tests.fx('yard')),
  '42501', 'documents must be stored in the dealer''s own folder');
insert into public.dealer_documents (dealer_id, kind, storage_path, content_type, size_bytes)
values (tests.fx('yard'), 'kra_pin_certificate', tests.fx('yard') || '/kra.pdf', 'application/pdf', 52000),
       (tests.fx('yard'), 'business_registration', tests.fx('yard') || '/reg.pdf', 'application/pdf', 61000);

select tests.as_superuser();
select tests.authenticate_as('admin');
select tests.eq((select missing_documents from public.admin_dealer_applications() where id = tests.fx('yard')),
  array['owner_id'], 'admins see what is missing');
select tests.eq((select kra_pin from public.admin_dealer_applications() where id = tests.fx('yard')), 'P051234567X',
  'admins see the KRA PIN');
select tests.throws(format($$ select public.admin_review_dealer(%L, 'approve') $$, tests.fx('yard')),
  '23514', 'a dealer cannot be approved with documents missing');
select tests.throws(format($$ select public.admin_review_dealer(%L, 'reject') $$, tests.fx('yard')),
  '22023', 'a rejection needs a reason');
select public.admin_review_dealer(tests.fx('yard'), 'reject', 'Upload the owner''s ID card, both sides');

select tests.as_superuser();
select tests.eq((select status::text || ': ' || rejection_reason from public.dealers where id = tests.fx('yard')),
  'rejected: Upload the owner''s ID card, both sides', 'the dealer is rejected with the reason');
select tests.eq((select payload ->> 'status' from private.deliveries
                  where profile_id = tests.id('bob') and kind = 'dealer_status'), 'rejected',
  'the owner gets an SMS about the decision');

select tests.authenticate_as('carol');
select tests.throws($$ select * from public.admin_dealer_applications() $$, '42501', 'only admins see applications');
select tests.throws(format($$ select public.resubmit_dealer(%L) $$, tests.fx('yard')), '42501',
  'outsiders cannot resubmit someone else''s application');

select tests.as_superuser();
select tests.authenticate_as('bob');
insert into public.dealer_documents (dealer_id, kind, storage_path, content_type, size_bytes)
values (tests.fx('yard'), 'owner_id', tests.fx('yard') || '/id.jpg', 'image/jpeg', 300000);
select public.resubmit_dealer(tests.fx('yard'));
select tests.eq((select status::text from public.dealers where id = tests.fx('yard')), 'pending',
  'the owner fixes it and sends it back');

select tests.as_superuser();
select tests.authenticate_as('admin');
select public.admin_review_dealer(tests.fx('yard'), 'approve', p_trusted => false);
select tests.as_superuser();
select tests.ok((select status = 'approved' and verified_at is not null and not trusted from public.dealers
                  where id = tests.fx('yard')), 'the admin approves the dealer');
select tests.ok((select reviewed_by = tests.id('admin') from public.dealer_kyc where dealer_id = tests.fx('yard')),
  'the KYC review is recorded');
select tests.eq((select count(*)::int from public.audit_log where target_id = tests.fx('yard')), 2,
  'both decisions are in the audit log');

select tests.authenticate_as('bob');
select tests.eq(tests.rows(format($$ delete from public.dealer_documents where dealer_id = %L $$, tests.fx('yard'))),
  0::bigint, 'documents cannot be removed once the dealer is approved');

-- Staff ----------------------------------------------------------------------------------------------
select tests.eq(public.invite_dealer_staff(tests.fx('yard'), '+254733000003', 'manager'), 'added',
  'someone with an account is added straight away');
select tests.eq(public.invite_dealer_staff(tests.fx('yard'), '+254766000006', 'sales'), 'invited',
  'a number without an account gets an invite');
select tests.throws(format($$ select public.invite_dealer_staff(%L, '+254733000003', 'sales') $$, tests.fx('yard')),
  '23505', 'the same person cannot be added twice');
select tests.throws(format($$ select public.invite_dealer_staff(%L, '+254766000007', 'owner') $$, tests.fx('yard')),
  '22023', 'owners are not invited');
select tests.throws(format($$ select public.invite_dealer_staff(%L, '0712345678', 'sales') $$, tests.fx('yard')),
  '22023', 'numbers must be in international format');

select tests.as_superuser();
select tests.eq((select count(*)::int from private.deliveries where kind = 'dealer_invite'), 2,
  'both invitees get an SMS');
select tests.eq((select to_address from private.deliveries where kind = 'dealer_invite' and profile_id is null),
  '+254766000006', 'the invite to a new number is addressed to that number');

select tests.authenticate_as('carol');
select tests.throws(format($$ select public.invite_dealer_staff(%L, '+254744000004', 'manager') $$, tests.fx('yard')),
  '42501', 'managers cannot add managers');
select tests.eq(public.invite_dealer_staff(tests.fx('yard'), '+254744000004', 'sales'), 'added',
  'managers can add sales staff');
select tests.eq((select count(*)::int from public.dealer_team(tests.fx('yard')) where invite_id is not null), 1,
  'managers see pending invites');
select tests.eq((select phone from public.dealer_team(tests.fx('yard')) where profile_id = tests.id('bob')),
  '+25472 ••• 002', 'team numbers are masked');
select tests.eq((select count(*)::int from public.dealer_documents), 3, 'managers see the dealer''s documents');

select tests.as_superuser();
select tests.authenticate_as('dave');
select tests.eq((select count(*)::int from public.dealer_team(tests.fx('yard')) where invite_id is not null), 0,
  'sales staff do not see pending invites');
select tests.throws(format($$ select public.invite_dealer_staff(%L, '+254766000008', 'sales') $$, tests.fx('yard')),
  '42501', 'sales staff cannot invite');

-- The invited number signs up and joins automatically.
select tests.as_superuser();
select tests.create_user('frank', '+254766000006', 'Frank Mutua');
select tests.eq((select role::text from public.dealer_members where profile_id = tests.id('frank')), 'sales',
  'an invited number joins the team on first sign-in');
select tests.ok((select accepted_by = tests.id('frank') from public.dealer_invites where phone = '+254766000006'),
  'the invite is marked accepted');

-- Claimed deliveries carry the payload for the SMS text.
update private.deliveries set not_before = now() - interval '1 second' where kind in ('dealer_invite', 'dealer_status');
select tests.as_service();
create temp table claimed on commit drop as select * from public.claim_deliveries(50);
select tests.as_superuser();
select tests.eq((select context ->> 'dealer_name' from claimed where to_address = '+254766000006'), 'Coast Auto Yard',
  'the invite SMS knows the dealer');
select tests.eq((select context ->> 'inviter_name' from claimed where to_address = '+254766000006'), 'Bob Otieno',
  'and who sent the invite');
select tests.eq((select count(*)::int from claimed where kind = 'dealer_status'), 2, 'decision SMSs are sent too');

-- Stock: start_listing for the dealer, CSV import ------------------------------------------------------
select tests.authenticate_as('dave');
insert into tests.fixtures
select 'axio', public.start_listing(tests.model_id('toyota', 'corolla-axio'), 2016, 'NZE161-7000001', tests.fx('yard'));
select tests.ok((select dealer_id = tests.fx('yard') and seller_id = tests.id('dave') and county_code = 1
                   from public.listings where id = tests.fx('axio')),
  'staff start a car for the dealership, in the dealer''s county');

select tests.throws(format($$ select public.import_dealer_stock(%L, '[]') $$, tests.fx('yard')), '22023',
  'an empty import is refused');
select tests.throws(format($$ select public.import_dealer_stock(%L, %L) $$, tests.fx('yard'),
  (select jsonb_agg(jsonb_build_object('row', i)) from generate_series(1, 201) i)), '22023', 'imports are capped at 200 rows');

create temp table imported on commit drop as
select value as r from jsonb_array_elements(public.import_dealer_stock(tests.fx('yard'), jsonb_build_array(
  jsonb_build_object('row', 2, 'model_id', tests.model_id('honda', 'fit'), 'year', 2015, 'mileage_km', 92000,
                     'price_kes', 980000, 'condition', 'foreign_used', 'body_type', 'hatchback', 'fuel_type', 'petrol',
                     'transmission', 'cvt', 'chassis', 'GP5-3100001', 'features', jsonb_build_array('Reverse camera')),
  jsonb_build_object('row', 3, 'model_id', tests.model_id('toyota', 'vitz'), 'year', 2016, 'mileage_km', 70000,
                     'price_kes', 850000, 'condition', 'foreign_used', 'body_type', 'hatchback', 'fuel_type', 'petrol',
                     'transmission', 'automatic', 'chassis', 'NSP130-2200001', 'registration_number', 'KDA 123A'),
  jsonb_build_object('row', 4, 'model_id', tests.model_id('toyota', 'vitz'), 'year', 1975, 'chassis', 'NSP130-2200002'),
  jsonb_build_object('row', 5, 'model_id', tests.model_id('toyota', 'vitz'), 'year', 2016, 'condition', 'brand_new_ish',
                     'chassis', 'NSP130-2200003')
)));
select tests.eq((select count(*)::int from imported where (r ->> 'ok')::boolean), 2, 'good rows are imported');
select tests.eq((select array_agg((r ->> 'row')::int order by (r ->> 'row')::int) from imported where not (r ->> 'ok')::boolean),
  array[4, 5], 'bad rows are reported by row number, without stopping the rest');
select tests.ok((select bool_and(r ? 'error') from imported where not (r ->> 'ok')::boolean), 'with the reason');
select tests.eq((select count(*)::int from public.listings where dealer_id = tests.fx('yard') and status = 'draft'), 3,
  'imported cars are drafts');
select tests.eq((select registration_number from public.listing_identity i join public.listings l on l.id = i.listing_id
                  where i.chassis_number = 'NSP130-2200001'), 'KDA 123A', 'chassis and plate are stored privately');

select tests.as_superuser();
select tests.authenticate_as('erin');
select tests.throws(format($$ select public.import_dealer_stock(%L, '[{"row": 2}]') $$, tests.fx('yard')), '42501',
  'outsiders cannot import into a dealer');
select tests.throws(format($$ select * from public.dealer_stock(%L) $$, tests.fx('yard')), '42501',
  'outsiders cannot see the dealer''s stock list');

-- Submit everything that's ready ----------------------------------------------------------------------
select tests.as_superuser();
insert into public.listing_media (listing_id, storage_path, thumb_path, position)
select l.id, l.id || '/p' || i || '.webp', l.id || '/p' || i || '_thumb.webp', i
  from public.listings l, generate_series(0, 2) i
 where l.dealer_id = tests.fx('yard') and l.model_id = tests.model_id('honda', 'fit');
insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes, uploaded_by)
select l.id, 'odometer_photo', l.id || '/odometer.jpg', 'image/jpeg', 2048, tests.id('dave')
  from public.listings l where l.dealer_id = tests.fx('yard') and l.model_id = tests.model_id('honda', 'fit');

select tests.authenticate_as('carol');
select tests.eq((select missing from public.dealer_stock(tests.fx('yard')) where title like '%Vitz%'),
  array['photos (0 of 3)', 'dashboard photo'], 'the stock list says what each car still needs');
select tests.eq((select missing from public.dealer_stock(tests.fx('yard')) where title like '%Fit%'), '{}'::text[],
  'a ready car needs nothing');
select tests.eq((select row(submitted, published, not_ready)::text from public.submit_ready_dealer_stock(tests.fx('yard'))),
  '(1,0,2)', 'submit-all sends the ready car to review and leaves the rest');
select tests.eq((select status::text from public.listings where model_id = tests.model_id('honda', 'fit') and dealer_id = tests.fx('yard')),
  'pending_review', 'an ordinary dealer''s car waits for a reviewer');

-- Trusted dealers publish straight away, unless the Passport has an open flag.
select tests.as_superuser();
select tests.authenticate_as('admin');
select public.admin_set_dealer_trust(tests.fx('yard'), true);
select tests.as_superuser();
insert into public.listing_media (listing_id, storage_path, thumb_path, position)
select l.id, l.id || '/p' || i || '.webp', l.id || '/p' || i || '_thumb.webp', i
  from public.listings l, generate_series(0, 2) i
 where l.dealer_id = tests.fx('yard') and l.status = 'draft';
insert into public.vehicle_documents (listing_id, kind, storage_path, content_type, size_bytes, uploaded_by)
select l.id, 'odometer_photo', l.id || '/odometer.jpg', 'image/jpeg', 2048, tests.id('dave')
  from public.listings l where l.dealer_id = tests.fx('yard') and l.status = 'draft';
update public.listings set mileage_km = 64000, price_kes = 1350000, condition = 'foreign_used', body_type = 'saloon',
       fuel_type = 'petrol', transmission = 'automatic'
 where id = tests.fx('axio');

-- An earlier listing of the same Axio showed more kilometres: the reading check will flag it.
select tests.ready_listing('erin', 'NZE161-7000001', 120000);
update public.listings set status = 'pending_review' where seller_id = tests.id('erin');
update public.listings set status = 'sold' where seller_id = tests.id('erin');

select tests.authenticate_as('dave');
select tests.eq((select row(submitted, published, not_ready)::text from public.submit_ready_dealer_stock(tests.fx('yard'))),
  '(2,1,0)', 'a trusted dealer''s clean car goes live on submission');
select tests.eq((select status::text from public.listings where id = tests.fx('axio')), 'pending_review',
  'a car with a mileage flag still waits for a reviewer');
select tests.as_superuser();
select tests.eq((select count(*)::int from public.audit_log where action = 'listing.auto_publish'), 1,
  'auto-publishing is audited');
insert into tests.fixtures select 'vitz', id from public.listings where dealer_id = tests.fx('yard') and status = 'live';

-- Buyers: the dealership is the seller they see -------------------------------------------------------
select tests.as_anon();
select tests.ok((select dealer_name = 'Coast Auto Yard' and dealer_verified and dealer_slug = 'coast-auto-yard'
                   from public.listing_overview where id = tests.fx('vitz')), 'visitors see the dealer and its badge');

select tests.as_superuser();
select tests.authenticate_as('erin');
select tests.eq((select seller_name || ' ' || phone from public.contact_seller(tests.fx('vitz'), 'call')),
  'Coast Auto Yard +254722000002', 'calls go to the dealership''s number');
with c as (insert into public.conversations (listing_id) values (tests.fx('vitz')) returning id)
insert into tests.fixtures select 'chat', id from c;
insert into public.messages (conversation_id, body) values (tests.fx('chat'), 'Is the Vitz still available?');
select tests.eq((select other_name from public.my_conversations(tests.fx('chat'))), 'Coast Auto Yard',
  'the buyer chats with the dealership');

select tests.as_superuser();
select tests.authenticate_as('frank');
select tests.throws(format($$ insert into public.conversations (listing_id) values (%L) $$, tests.fx('vitz')), '42501',
  'staff cannot open a chat about their own stock');
select tests.throws(format($$ select * from public.contact_seller(%L, 'call') $$, tests.fx('vitz')), '42501',
  'or call their own stock');
select tests.eq(public.my_unread_messages(), 1, 'every staff member sees the new message');
select tests.eq((select other_name || ' / ' || unread from public.my_conversations(tests.fx('chat'))), 'Erin Achieng / 1',
  'staff see the buyer''s name');
insert into public.messages (conversation_id, body) values (tests.fx('chat'), 'Yes it is. Come by on Saturday.');
select tests.eq(public.mark_conversation_read(tests.fx('chat')), 1, 'a colleague marks the buyer''s message read');

select tests.as_superuser();
select tests.authenticate_as('dave');
select tests.eq(public.my_unread_messages(), 0, 'it is read for the whole team');
select tests.ok((select last_from_me from public.my_conversations(tests.fx('chat'))),
  'a colleague''s reply counts as answered');

select tests.as_superuser();
select tests.authenticate_as('erin');
select tests.eq(public.my_unread_messages(), 1, 'the buyer has the reply');
select tests.eq(public.mark_conversation_read(tests.fx('chat')), 1, 'and reads it');
select tests.as_superuser();
select tests.eq((select payload::text from private.deliveries d
                  where d.kind = 'new_message' and d.profile_id = tests.id('erin') limit 1) is not null, true,
  'the buyer is notified of the reply');
select tests.eq((private.delivery_context(d)) ->> 'sender_name', 'Coast Auto Yard',
  'notifications to the buyer name the dealership')
  from private.deliveries d where d.kind = 'new_message' and d.profile_id = tests.id('erin');

select tests.authenticate_as('carol');
select tests.eq((select count(*)::int from public.messages where conversation_id = tests.fx('chat')), 2,
  'managers read the dealership''s chats');

-- Views --------------------------------------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('erin');
select tests.throws(format($$ select public.record_listing_view(%L, 'visitor-hash-0000000001') $$, tests.fx('vitz')),
  '42501', 'browsers cannot record views directly');
select tests.as_superuser();
set session_replication_role = replica;  -- skip triggers to backdate the row
update public.listings set updated_at = now() - interval '1 day' where id = tests.fx('vitz');
set session_replication_role = origin;
select tests.as_service();
select tests.ok(public.record_listing_view(tests.fx('vitz'), 'visitor-hash-0000000001'), 'a visit is counted');
select tests.ok((select updated_at < now() - interval '1 hour' from public.listings where id = tests.fx('vitz')),
  'counting a view does not change when the listing was last updated');
select tests.ok(not public.record_listing_view(tests.fx('vitz'), 'visitor-hash-0000000001'),
  'the same visitor is counted once a day');
select tests.ok(public.record_listing_view(tests.fx('vitz'), 'visitor-hash-0000000002', tests.id('erin')),
  'a signed-in buyer counts');
select tests.ok(not public.record_listing_view(tests.fx('vitz'), 'visitor-hash-0000000003', tests.id('frank')),
  'the dealer''s own staff do not');
select tests.ok(not public.record_listing_view(tests.fx('axio'), 'visitor-hash-0000000001'),
  'cars that are not live do not count');

select tests.as_superuser();
select tests.authenticate_as('dave');
select tests.eq((select row(views_total, views_7d, chats, calls, whatsapps)::text
                   from public.dealer_stock(tests.fx('yard')) where listing_id = tests.fx('vitz')),
  '(2,2,1,1,0)', 'the stock list shows views and leads per car');
select tests.eq((select listed_by from public.dealer_stock(tests.fx('yard')) where listing_id = tests.fx('vitz')),
  'Dave Kamau', 'and who listed it');
select tests.eq((select array_agg(lead_type::text order by lead_type::text) from public.dealer_leads(tests.fx('yard'))),
  array['call', 'chat'], 'the lead inbox lists every lead');
select tests.eq((select conversation_id from public.dealer_leads(tests.fx('yard')) where lead_type = 'chat'), tests.fx('chat'),
  'a chat lead links to its conversation');
select tests.eq((select count(*)::int from public.listing_daily_views), 1, 'staff read daily views for their cars');

select tests.as_superuser();
select tests.authenticate_as('erin');
select tests.eq((select count(*)::int from public.listing_daily_views), 0, 'others cannot');
select tests.throws(format($$ select * from public.dealer_leads(%L) $$, tests.fx('yard')), '42501',
  'or read the dealer''s leads');

-- Staff who leave lose access ---------------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq(tests.rows(format($$ delete from public.dealer_members where dealer_id = %L and profile_id = %L $$,
  tests.fx('yard'), tests.id('frank'))), 1::bigint, 'the owner removes a salesperson');
select tests.as_superuser();
select tests.authenticate_as('frank');
select tests.eq((select count(*)::int from public.my_conversations()), 0, 'who no longer sees the dealer''s chats');
select tests.throws(format($$ insert into public.messages (conversation_id, body) values (%L, 'hello') $$, tests.fx('chat')),
  '42501', 'or can reply in them');

rollback;
