-- Sprint 3: chat rules, calls and WhatsApp leads, the notification outbox, alerts and email.
begin;

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.create_user('carol', '+254733000003', 'Carol Mwende');
select tests.create_user('dave', '+254744000004', 'Dave Kamau');
select tests.create_user('admin', '+254700000099', 'Site Admin');
update public.profiles set role = 'admin' where id = tests.id('admin');

create function pg_temp.live(p_name text, p_seller text, p_model text default 'fit', p_price bigint default 750000,
                             p_status text default 'live') returns uuid language sql as $$
  with l as (
    insert into public.listings (seller_id, model_id, year, mileage_km, price_kes, condition, body_type,
                                 fuel_type, transmission, county_code, status)
    values (tests.id(p_seller), tests.model_id(case when p_model = 'vitz' then 'toyota' else 'honda' end, p_model),
            2014, 110000, p_price, 'foreign_used', 'hatchback', 'petrol', 'cvt', 1, p_status::public.listing_status)
    returning id
  )
  insert into tests.fixtures select p_name, id from l returning id;
$$;

select pg_temp.live('fit', 'alice');
select pg_temp.live('draft', 'alice', p_status => 'draft');

create function pg_temp.deliveries(p_who text, p_channel text default 'sms') returns bigint language sql as $$
  select count(*) from private.deliveries
   where profile_id = tests.id(p_who) and channel = p_channel::public.delivery_channel and status <> 'skipped';
$$;

-- Chat ------------------------------------------------------------------------------------------
select tests.authenticate_as('carol');
with c as (insert into public.conversations (listing_id) values (tests.fx('fit')) returning id)
insert into tests.fixtures select 'chat', id from c;

select tests.throws(format($$ insert into public.messages (conversation_id, body) values (%L, E'  \n ') $$, tests.fx('chat')),
  '23514', 'blank messages are refused');
with m as (insert into public.messages (conversation_id, body) values (tests.fx('chat'), '  Is the Fit still available?  ') returning id)
insert into tests.fixtures select 'm1', id from m;
select tests.eq((select body from public.messages where id = tests.fx('m1')), 'Is the Fit still available?',
  'messages are trimmed');
select tests.eq((select flags from public.messages where id = tests.fx('m1')), '{}'::text[], 'an ordinary message has no flags');

select tests.as_superuser();
select tests.eq((select count(*)::int from public.leads where listing_id = tests.fx('fit') and lead_type = 'chat'), 1,
  'starting a conversation logs a chat lead');
select tests.eq(pg_temp.deliveries('alice'), 1::bigint, 'the seller gets one SMS queued');
select tests.ok((select not_before > now() from private.deliveries where profile_id = tests.id('alice')),
  'the SMS waits a minute in case the seller is reading already');
select tests.eq(pg_temp.deliveries('alice', 'email'), 0::bigint, 'no email without a verified address');

select tests.authenticate_as('carol');
select tests.lives(format($$ insert into public.messages (conversation_id, body) values (%L, 'Can I see it on Saturday?') $$,
  tests.fx('chat')), 'the buyer sends a second message');
select tests.as_superuser();
select tests.eq(pg_temp.deliveries('alice'), 1::bigint, 'one SMS per conversation per half hour');

select tests.authenticate_as('alice');
with m as (insert into public.messages (conversation_id, body)
           values (tests.fx('chat'), 'Yes. Send a deposit of 20,000 via M-Pesa to hold it') returning id)
insert into tests.fixtures select 'scam', id from m;
select tests.eq((select flags from public.messages where id = tests.fx('scam')), '{payment}'::text[],
  'a message asking for money is flagged so the app can warn the reader');
select tests.eq((select public.mark_conversation_read(tests.fx('chat'))), 2, 'the seller reads both buyer messages');
select tests.eq((select public.mark_conversation_read(tests.fx('chat'))), 0, 'reading again changes nothing');
select tests.eq((select public.my_unread_messages()), 0, 'the seller has nothing unread');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.eq((select public.mark_conversation_read(tests.fx('chat'))), 1, 'the buyer can only mark the seller''s message');
select tests.eq((select count(*)::int from public.messages where conversation_id = tests.fx('chat') and read_at is not null), 3,
  'read receipts are visible to both sides');

select tests.eq((select other_name from public.my_conversations()), 'Alice Wanjiru', 'the inbox names the other person');
select tests.eq((select is_buyer from public.my_conversations()), true, 'and says which side you are on');
select tests.eq((select last_body from public.my_conversations()), 'Yes. Send a deposit of 20,000 via M-Pesa to hold it',
  'and shows the latest message');

select tests.as_superuser();
update public.listings set status = 'sold' where id = tests.fx('fit');
select tests.authenticate_as('carol');
select tests.eq((select listing_title from public.my_conversations(tests.fx('chat'))), '2014 Honda Fit',
  'the car still shows in the inbox after it sells');
select tests.eq((select listing_is_public from public.my_conversations(tests.fx('chat'))), false, 'marked as no longer on sale');
select tests.as_superuser();
update public.listings set status = 'live' where id = tests.fx('fit');

select tests.authenticate_as('dave');
select tests.eq((select count(*)::int from public.my_conversations()), 0, 'outsiders have an empty inbox');
select tests.eq((select count(*)::int from public.my_conversations(tests.fx('chat'))), 0, 'and cannot open someone else''s chat');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.throws(format($$ insert into public.messages (conversation_id, body)
                              select %L, 'Hello ' || i from generate_series(1, 40) i $$, tests.fx('chat')),
  '23514', 'flooding a chat is stopped');

-- Calls and WhatsApp ---------------------------------------------------------------------------
select tests.as_superuser();
select tests.as_anon();
select tests.throws(format($$ select * from public.contact_seller(%L, 'call') $$, tests.fx('fit')), '42501',
  'signed-out visitors cannot reveal a number');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.eq((select phone from public.contact_seller(tests.fx('fit'), 'call')), '+254711000001',
  'a signed-in buyer gets the seller''s number');
select tests.lives(format($$ select * from public.contact_seller(%L, 'call') $$, tests.fx('fit')), 'tapping again works');
select tests.throws(format($$ select * from public.contact_seller(%L, 'chat') $$, tests.fx('fit')), '22023',
  'chats go through conversations');
select tests.throws(format($$ select * from public.contact_seller(%L, 'call') $$, tests.fx('draft')), '42501',
  'no numbers for cars that are not on sale');

select tests.as_superuser();
select tests.eq((select count(*)::int from public.leads where listing_id = tests.fx('fit') and lead_type = 'call'), 1,
  'repeat taps count as one call lead a day');

select tests.authenticate_as('alice');
select tests.throws(format($$ select * from public.contact_seller(%L, 'call') $$, tests.fx('fit')), '42501',
  'sellers cannot contact themselves');
select tests.lives($$ update public.profiles set accepts_whatsapp = false where id = auth.uid() $$,
  'a seller turns off WhatsApp');
select tests.eq((select chats::int || '/' || calls || '/' || whatsapps || '/' || unread_messages
                   from public.my_lead_counts() where listing_id = tests.fx('fit')), '1/1/0/0',
  'the seller sees leads per car: 1 chat, 1 call, no WhatsApp, nothing unread');

select tests.as_superuser();
select tests.as_anon();
select tests.eq((select seller_accepts_whatsapp from public.listing_overview where id = tests.fx('fit')), false,
  'the listing knows to hide the WhatsApp button');
select tests.throws($$ select email from public.profiles $$, '42501', 'email addresses are private');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.throws(format($$ select * from public.contact_seller(%L, 'whatsapp') $$, tests.fx('fit')), '42501',
  'buyers cannot get around a seller''s choice');

select tests.as_superuser();
select pg_temp.live('car' || i, 'dave') from generate_series(1, 31) i;
select tests.authenticate_as('carol');
select tests.throws($$
  do $d$ declare i int; begin
    for i in 1..31 loop
      perform * from public.contact_seller(tests.fx('car' || i), 'call');
    end loop;
  end $d$ $$, '23514', 'one account cannot harvest dozens of numbers a day');
select tests.as_superuser();
delete from public.listings where seller_id = tests.id('dave');

-- The outbox ------------------------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.throws($$ select count(*) from private.deliveries $$, '42501', 'the outbox is private');
select tests.throws($$ select * from public.claim_deliveries(10) $$, '42501', 'users cannot run the delivery job');
select tests.throws($$ select * from public.admin_recent_deliveries() $$, '42501', 'or read the admin outbox');

select tests.as_superuser();
select tests.as_service();
select tests.eq((select count(*)::int from public.claim_deliveries(10)), 0, 'nothing is due before the minute is up');

select tests.as_superuser();
-- Pretend the seller hasn't opened the chat yet (above, she read it, which rightly cancelled the SMS).
select tests.eq((select skip_reason from private.deliveries where profile_id = tests.id('alice')), 'read in the app',
  'reading the chat cancelled the waiting SMS');
update public.messages set read_at = null where conversation_id = tests.fx('chat') and sender_id = tests.id('carol');
update private.deliveries set status = 'pending', skip_reason = null, not_before = now() - interval '1 second'
 where profile_id = tests.id('alice');
select tests.as_service();
create temp table claimed as select * from public.claim_deliveries(10);
select tests.as_superuser();
select tests.eq((select count(*)::int from claimed), 1, 'the seller''s SMS is claimed');
select tests.eq((select to_address from claimed), '+254711000001', 'addressed to the seller''s phone');
select tests.eq((select context ->> 'sender_name' from claimed), 'Carol Mwende', 'with the buyer''s name');
select tests.eq((select context ->> 'listing_title' from claimed), '2014 Honda Fit', 'the car');
select tests.eq((select context ->> 'excerpt' from claimed), 'Is the Fit still available?', 'and the message');

select tests.as_service();
select public.finish_delivery((select id from claimed), false, p_error => 'Gateway timeout');
select tests.as_superuser();
select tests.eq((select status::text || ':' || attempts from private.deliveries where id = (select id from claimed)),
  'pending:1', 'a failed send is retried');
update private.deliveries set not_before = now() - interval '1 second' where id = (select id from claimed);
select tests.as_service();
select tests.eq((select count(*)::int from public.claim_deliveries(10)), 1, 'and claimed again');
select public.finish_delivery((select id from claimed), true, '+254711000001',
  'Magari: Carol sent you a message about your 2014 Honda Fit', 'ATXid_1');
select tests.as_superuser();
select tests.eq((select status::text from private.deliveries where id = (select id from claimed)), 'sent', 'then sent');

-- Read before the minute was up: no SMS.
select tests.authenticate_as('dave');
with c as (insert into public.conversations (listing_id) values (tests.fx('fit')) returning id)
insert into tests.fixtures select 'chat2', id from c;
insert into public.messages (conversation_id, body) values (tests.fx('chat2'), 'Hi, is it available?');
select tests.as_superuser();
select tests.authenticate_as('alice');
select public.mark_conversation_read(tests.fx('chat2'));
select tests.as_superuser();
update private.deliveries set not_before = now() - interval '1 second' where status = 'pending';
select tests.as_service();
select tests.eq((select count(*)::int from public.claim_deliveries(10)), 0, 'a message read in the app is not texted');
select tests.as_superuser();
select tests.eq((select skip_reason from private.deliveries where conversation_id = tests.fx('chat2')), 'read in the app',
  'and the outbox says why');

-- Turned off: no SMS at all.
insert into public.notification_settings (profile_id, sms_messages) values (tests.id('dave'), false);
select tests.authenticate_as('alice');
insert into public.messages (conversation_id, body) values (tests.fx('chat2'), 'Yes it is');
select tests.as_superuser();
select tests.eq(pg_temp.deliveries('dave'), 0::bigint, 'people who turn SMS off get none');

-- The daily cap.
select private.queue_delivery(tests.id('dave'), 'sms', 'search_alert') from generate_series(1, 12);
select tests.eq((select private.queue_delivery(tests.id('dave'), 'sms', 'search_alert')), null::uuid,
  'no more than 12 SMS a day to one person');
select tests.eq((select skip_reason from private.deliveries where profile_id = tests.id('dave') and status = 'skipped'
                  order by created_at desc limit 1), 'daily limit reached', 'the outbox records the cap');
delete from private.deliveries where profile_id = tests.id('dave');

select tests.authenticate_as('admin');
select tests.ok((select count(*) > 0 from public.admin_recent_deliveries()), 'admins can see what went out');
select tests.ok((select count(*) > 0 from public.messages where read_at is null), 'admins can read every chat, for moderation');
select tests.eq((select public.my_unread_messages()), 0, 'but their unread badge only counts their own chats');
select tests.eq((select body from public.admin_recent_deliveries() where status = 'sent'),
  'Magari: Carol sent you a message about your 2014 Honda Fit', 'including the text that was sent');

-- Settings ---------------------------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.eq((select sms_search_alerts::text from public.my_settings()), 'daily', 'saved-search SMS default to a daily summary');
select tests.lives($$ insert into public.notification_settings (sms_messages) values (true) $$, 'a person saves their settings');
select tests.throws(format($$ insert into public.notification_settings (profile_id) values (%L) $$, tests.id('alice')),
  '42501', 'nobody writes someone else''s settings');
select tests.as_superuser();
select tests.authenticate_as('dave');
select tests.eq((select count(*)::int from public.notification_settings), 1, 'people only see their own settings');

-- Saved-search alerts: daily summary by default, instant on request ---------------------------
select tests.as_superuser();
select tests.authenticate_as('carol');
with s as (insert into public.saved_searches (name, filters) values ('Honda in Mombasa', '{"make":"honda","county":"mombasa"}')
           returning id)
insert into tests.fixtures select 'search', id from s;
select tests.as_superuser();
update public.saved_searches set last_alerted_at = now() - interval '1 hour' where id = tests.fx('search');
update public.listings set published_at = now() - interval '10 minutes' where id = tests.fx('fit');
select tests.as_service();
select tests.eq((select public.queue_saved_search_alerts()), 1, 'a match is recorded');
select tests.as_superuser();
select tests.eq(pg_temp.deliveries('carol'), 0::bigint, 'daily people are not texted straight away');
select tests.as_service();
select tests.eq((select public.queue_search_digests()), 1, 'the morning job queues one summary');
select tests.eq((select public.queue_search_digests()), 0, 'and only once');
select tests.as_superuser();
update private.deliveries set not_before = now() - interval '1 second' where status = 'pending';
select tests.as_service();
create temp table digest as select * from public.claim_deliveries(10);
select tests.as_superuser();
select tests.eq((select context -> 'searches' -> 0 ->> 'name' from digest where kind = 'search_digest'), 'Honda in Mombasa',
  'the summary names the search');
select tests.eq((select (context ->> 'total')::int from digest where kind = 'search_digest'), 1, 'and counts the new cars');

select tests.authenticate_as('carol');
update public.notification_settings set sms_search_alerts = 'instant';
select tests.as_superuser();
select pg_temp.live('fit2', 'alice', p_price => 680000);
update public.listings set published_at = now() - interval '1 minute' where id = tests.fx('fit2');
update public.saved_searches set last_alerted_at = now() - interval '2 minutes' where id = tests.fx('search');
select tests.as_service();
select public.queue_saved_search_alerts();
select tests.as_superuser();
select tests.eq((select count(*)::int from private.deliveries where profile_id = tests.id('carol') and kind = 'search_alert'
                   and status = 'pending'), 1, 'instant people get a text for each new match');
update private.deliveries set not_before = now() - interval '1 second' where status = 'pending';
select tests.as_service();
create temp table alert as select * from public.claim_deliveries(10);
select tests.as_superuser();
select tests.eq((select context ->> 'first_title' from alert where kind = 'search_alert'), '2014 Honda Fit',
  'the alert names the new car');

-- Email -----------------------------------------------------------------------------------------
select tests.authenticate_as('carol');
select tests.throws($$ select public.request_email_verification('not-an-email') $$, '22023', 'addresses are checked');
select tests.lives($$ select public.request_email_verification('  Carol@Example.com ') $$, 'a buyer asks to add an email');
select tests.as_superuser();
create temp table code as
  select payload ->> 'code' as code, to_address from private.deliveries
   where profile_id = tests.id('carol') and kind = 'email_verification';
grant select on code to authenticated;
select tests.eq((select to_address from code), 'carol@example.com', 'the code goes to the new address');
select tests.ok((select code ~ '^[0-9]{6}$' from code), 'as six digits');
select tests.authenticate_as('carol');
select tests.eq((select pending_email from public.my_settings()), 'carol@example.com', 'the address waits for its code');
select tests.throws($$ select public.confirm_email('000000') $$, '22023', 'a wrong code is refused');
select tests.eq((select public.confirm_email((select code from code))), 'carol@example.com', 'the right code verifies it');
select tests.eq((select email from public.my_settings()), 'carol@example.com', 'and it shows in settings');

select tests.as_superuser();
select tests.authenticate_as('alice');
insert into public.messages (conversation_id, body) values (tests.fx('chat'), 'Still interested?');
select tests.as_superuser();
select tests.eq(pg_temp.deliveries('carol', 'email'), 2::bigint, 'verified buyers also get new messages by email');

update private.deliveries set not_before = now() - interval '1 second', status = 'pending'
 where profile_id = tests.id('carol') and kind = 'email_verification';
select tests.as_service();
select public.finish_delivery(d.id, true, 'carol@example.com', 'Your code is 123456')
  from (select id from public.claim_deliveries(50) where kind = 'email_verification') d;
select tests.as_superuser();
select tests.ok((select not (payload ? 'code') and body = '(verification code)' from private.deliveries
                  where profile_id = tests.id('carol') and kind = 'email_verification'),
  'codes are wiped from the outbox once sent');

select tests.authenticate_as('carol');
select tests.throws($$ select public.request_email_verification('x' || i || '@example.com') from generate_series(1, 6) i $$,
  '23514', 'codes can''t be requested endlessly');

rollback;
