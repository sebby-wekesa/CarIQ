-- New kinds of SMS for dealers. Kept in their own migration: Postgres won't let a new enum
-- value be used in the same transaction that adds it.
alter type public.delivery_kind add value if not exists 'dealer_invite';
alter type public.delivery_kind add value if not exists 'dealer_status';
