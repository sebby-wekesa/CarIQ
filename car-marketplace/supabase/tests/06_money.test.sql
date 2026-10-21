-- Orders, payments, ledger, reports, audit log and Phase 2 tables.
begin;

select tests.create_user('alice', '+254711000001', 'Alice Wanjiru');
select tests.create_user('bob', '+254722000002', 'Bob Otieno');
select tests.create_user('admin', '+254700000099', 'Site Admin');
update public.profiles set role = 'admin' where id = tests.id('admin');

-- Users cannot write money tables -----------------------------------------------------
select tests.authenticate_as('alice');
select tests.throws(format($$ insert into public.orders (buyer_id, product, amount_kes) values (%L, 'listing_boost', 500) $$,
  tests.id('alice')), '42501', 'users cannot create orders directly');
select tests.throws($$ insert into public.ledger_entries (journal_id, account, debit_kes)
                      values (gen_random_uuid(), 'assets:cashia_clearing', 500) $$,
  '42501', 'users cannot write to the ledger');

-- The payments service records a paid boost -----------------------------------------------
select tests.as_superuser();
select tests.as_service();
with o as (
  insert into public.orders (buyer_id, product, amount_kes, status, paid_at)
  values (tests.id('alice'), 'listing_boost', 500, 'paid', now())
  returning id
)
insert into tests.fixtures select 'order', id from o;

with p as (
  insert into public.payments (order_id, provider, provider_ref, amount_kes, status)
  values (tests.fx('order'), 'mock', 'mock_1', 500, 'succeeded')
  returning id
)
insert into tests.fixtures select 'payment', id from p;

select tests.throws(format($$ insert into public.payments (order_id, provider, provider_ref, amount_kes)
                              values (%L, 'mock', 'mock_1', 500) $$, tests.fx('order')),
  '23505', 'a provider reference can only be recorded once (idempotent callbacks)');

set constraints public.ledger_journal_balanced immediate;

-- KSh 500 received: 431 revenue + 69 VAT (16%).
select tests.lives(format($$
  insert into public.ledger_entries (journal_id, account, debit_kes, credit_kes, order_id, payment_id) values
    ('00000000-0000-0000-0000-000000000001', 'assets:cashia_clearing', 500, 0, %1$L, %2$L),
    ('00000000-0000-0000-0000-000000000001', 'revenue:boosts', 0, 431, %1$L, %2$L),
    ('00000000-0000-0000-0000-000000000001', 'liabilities:vat_output', 0, 69, %1$L, %2$L)
$$, tests.fx('order'), tests.fx('payment')), 'a balanced journal is accepted');

select tests.throws($$
  insert into public.ledger_entries (journal_id, account, debit_kes, credit_kes) values
    ('00000000-0000-0000-0000-000000000002', 'assets:cashia_clearing', 500, 0),
    ('00000000-0000-0000-0000-000000000002', 'revenue:boosts', 0, 400)
$$, '23514', 'an unbalanced journal is rejected');

select tests.throws($$ insert into public.ledger_entries (journal_id, account, debit_kes, credit_kes)
                      values (gen_random_uuid(), 'assets:cash', 100, 100) $$,
  '23514', 'a ledger row is either a debit or a credit, not both');

select tests.throws($$ update public.ledger_entries set debit_kes = 1 where account = 'assets:cashia_clearing' $$,
  '42501', 'the ledger is append-only (no updates)');
select tests.throws($$ delete from public.ledger_entries $$, '42501', 'the ledger is append-only (no deletes)');

-- Who can read what ------------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('alice');
select tests.eq((select count(*)::int from public.orders), 1, 'the buyer sees their own order');
select tests.eq((select count(*)::int from public.payments), 0, 'users do not see raw payment records');
select tests.eq((select count(*)::int from public.ledger_entries), 0, 'users do not see the ledger');

select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.eq((select count(*)::int from public.orders), 0, 'other users do not see the order');

select tests.as_superuser();
select tests.authenticate_as('admin');
select tests.eq((select count(*)::int from public.payments), 1, 'admins see payments');
select tests.eq((select count(*)::int from public.ledger_entries), 3, 'admins see the ledger');

-- Reports and audit log -----------------------------------------------------------------------
select tests.as_superuser();
select tests.authenticate_as('bob');
select tests.lives(format($$ insert into public.reports (target_type, target_id, reason, details)
                             values ('profile', %L, 'scam', 'Asked for a deposit by M-PESA') $$, tests.id('alice')),
  'a user reports a suspected scammer');
select tests.eq((select count(*)::int from public.reports), 1, 'the reporter sees their report');
select tests.throws($$ update public.reports set status = 'dismissed' $$, '42501', 'reporters cannot resolve reports');

select tests.as_superuser();
select tests.authenticate_as('alice');
select tests.eq((select count(*)::int from public.reports), 0, 'the reported user cannot see who reported them');
select tests.eq((select count(*)::int from public.audit_log), 0, 'users cannot read the audit log');

-- Phase 2 tables are read-only ------------------------------------------------------------------
select tests.throws($$ insert into public.deals (listing_id, buyer_id, seller_id, agreed_price_kes)
                      values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1000000) $$,
  '42501', 'Safe Deal records cannot be created through the API yet');

rollback;
