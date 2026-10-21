-- Conversations, messages and leads.
begin;

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.create_user('carol', '+254733000003', 'Carol Mwende');
select tests.create_user('dave', '+254744000004', 'Dave Kamau');

-- A live listing by Alice (created directly as superuser to keep the fixture short).
with l as (
  insert into public.listings (seller_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code, status)
  values (tests.id('alice'), tests.model_id('honda', 'fit'), 2014, 110000, 750000, 'foreign_used',
          'hatchback', 'petrol', 'cvt', 1, 'live')
  returning id
)
insert into tests.fixtures select 'fit', id from l;

with l as (
  insert into public.listings (seller_id, model_id, year, mileage_km, price_kes, condition, body_type,
                               fuel_type, transmission, county_code, status)
  values (tests.id('alice'), tests.model_id('mazda', 'demio'), 2015, 95000, 690000, 'foreign_used',
          'hatchback', 'petrol', 'automatic', 1, 'draft')
  returning id
)
insert into tests.fixtures select 'demio_draft', id from l;

-- Carol messages Alice ---------------------------------------------------------------
select tests.authenticate_as('carol');
with c as (
  insert into public.conversations (listing_id) values (tests.fx('fit')) returning id
)
insert into tests.fixtures select 'chat', id from c;

select tests.eq((select seller_id from public.conversations where id = tests.fx('chat')), tests.id('alice'),
  'the seller is taken from the listing');
select tests.throws(format($$ insert into public.conversations (listing_id, seller_id) values (%L, %L) $$,
  tests.fx('fit'), tests.id('dave')), '42501', 'the client cannot choose who the seller is');
select tests.throws(format($$ insert into public.conversations (listing_id) values (%L) $$, tests.fx('demio_draft')),
  '42501', 'no conversations about listings that are not live');

with m as (
  insert into public.messages (conversation_id, body) values (tests.fx('chat'), 'Is the Fit still available?')
  returning id
)
insert into tests.fixtures select 'msg1', id from m;
select tests.eq(tests.rows(format($$ update public.messages set read_at = now() where id = %L $$, tests.fx('msg1'))),
  0::bigint, 'the sender cannot mark their own message as read');

select tests.as_superuser();
select tests.ok((select last_message_at is not null from public.conversations where id = tests.fx('chat')),
  'a new message bumps the conversation');

-- Alice replies ---------------------------------------------------------------------------
select tests.authenticate_as('alice');
select tests.eq((select count(*)::int from public.messages where conversation_id = tests.fx('chat')), 1,
  'the seller sees the buyer''s message');
select tests.eq(tests.rows(format($$ update public.messages set read_at = now() where id = %L $$, tests.fx('msg1'))),
  1::bigint, 'the recipient marks it read');
select tests.throws(format($$ update public.messages set body = 'edited' where id = %L $$, tests.fx('msg1')),
  '42501', 'messages cannot be edited');
select tests.lives(format($$ insert into public.messages (conversation_id, body) values (%L, 'Yes, come view it') $$,
  tests.fx('chat')), 'the seller replies');
select tests.throws(format($$ insert into public.conversations (listing_id) values (%L) $$, tests.fx('fit')),
  '42501', 'a seller cannot open a conversation with themselves');

-- Dave is not in the conversation -----------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('dave');
select tests.eq((select count(*)::int from public.conversations), 0, 'outsiders see no conversations');
select tests.eq((select count(*)::int from public.messages), 0, 'outsiders see no messages');
select tests.throws(format($$ insert into public.messages (conversation_id, body) values (%L, 'spam') $$,
  tests.fx('chat')), '42501', 'outsiders cannot post into a conversation');
select tests.throws(format($$ insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'fake') $$,
  tests.fx('chat'), tests.id('carol')), '42501', 'nobody can send as someone else');

-- Leads ---------------------------------------------------------------------------------------
-- Since Sprint 3, leads come only from contact_seller() and new conversations (tested in 10_).
select tests.as_superuser();
select tests.as_anon();
select tests.throws(format($$ insert into public.leads (listing_id, lead_type) values (%L, 'whatsapp') $$,
  tests.fx('fit')), '42501', 'leads cannot be inserted directly, so counts stay honest');
select tests.throws($$ select * from public.leads $$, '42501', 'anon cannot read leads');

select tests.as_superuser();
select tests.authenticate_as('carol');
select tests.throws(format($$ insert into public.leads (listing_id, lead_type) values (%L, 'call') $$,
  tests.fx('fit')), '42501', 'signed-in buyers cannot insert leads directly either');
select tests.eq((select count(*)::int from public.leads), 0, 'buyers cannot read the seller''s leads');

select tests.as_superuser();
select tests.authenticate_as('alice');
select tests.eq((select count(*)::int from public.leads where listing_id = tests.fx('fit')), 1,
  'the seller sees the chat lead from Carol''s conversation');

rollback;
