-- Sprint 5: reconcile successful payments and grant the purchased benefit in one transaction.
-- The API roles cannot call this function. Only the server's service role may post money.

create unique index ledger_one_cash_receipt_per_order_idx
  on public.ledger_entries (order_id)
  where order_id is not null and account = 'assets:cashia_clearing';

-- Promotion windows should not make an otherwise untouched listing look freshly edited.
create or replace function private.set_listing_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['boosted_until', 'featured_until', 'updated_at']) =
     (to_jsonb(old) - array['boosted_until', 'featured_until', 'updated_at']) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at before update on public.listings
  for each row execute function private.set_listing_updated_at();

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_kes bigint,
  p_status public.payment_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_payment_id uuid;
  v_journal_id uuid;
  v_vat_kes bigint;
  v_revenue_account text;
  v_plan_period public.plan_period;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_current_plan_id text;
begin
  if p_provider is null or p_provider !~ '^[a-z][a-z0-9_-]{1,31}$'
     or p_provider_ref is null or length(p_provider_ref) not between 1 and 200 then
    raise exception 'Invalid payment reference' using errcode = '22023';
  end if;
  if p_amount_kes is null or p_amount_kes <= 0 or p_status is null then
    raise exception 'Payment amount must be positive' using errcode = '22023';
  end if;
  if p_status = 'refunded' then
    raise exception 'Refunds require a separate reversing journal' using errcode = '0A000';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.amount_kes <> p_amount_kes then
    raise exception 'Payment amount does not match the order' using errcode = '22000';
  end if;

  select * into v_payment
    from public.payments
   where provider = p_provider and provider_ref = p_provider_ref
   for update;

  if found then
    if v_payment.order_id <> p_order_id or v_payment.amount_kes <> p_amount_kes then
      raise exception 'Payment reference is already attached to a different order' using errcode = '23505';
    end if;
    v_payment_id := v_payment.id;
  else
    if v_order.status <> 'pending' then
      raise exception 'Order is no longer awaiting payment' using errcode = '55000';
    end if;
    insert into public.payments (order_id, provider, provider_ref, amount_kes, status, raw)
    values (
      p_order_id,
      p_provider,
      p_provider_ref,
      p_amount_kes,
      p_status,
      jsonb_build_object('status', p_status, 'amount_kes', p_amount_kes)
    )
    returning id into v_payment_id;
  end if;

  -- A delayed or duplicated non-success event must never downgrade a paid order.
  if v_order.status = 'paid' then
    if v_payment.status = 'succeeded' or p_status <> 'succeeded' then
      return;
    end if;
    raise exception 'Order has already been paid with another reference' using errcode = '55000';
  end if;

  if v_order.status <> 'pending' then
    if p_status = 'succeeded' then
      raise exception 'Order is no longer awaiting payment' using errcode = '55000';
    end if;
    return;
  end if;

  update public.payments
     set status = p_status,
         raw = jsonb_build_object('status', p_status, 'amount_kes', p_amount_kes)
   where id = v_payment_id;

  if p_status = 'pending' then
    return;
  elsif p_status in ('failed', 'cancelled') then
    update public.orders
       set status = case when p_status = 'failed' then 'failed'::public.order_status else 'cancelled'::public.order_status end
     where id = p_order_id and status = 'pending';
    return;
  end if;

  if p_status <> 'succeeded' then
    raise exception 'Unsupported payment status' using errcode = '22023';
  end if;

  update public.orders
     set status = 'paid', paid_at = now()
   where id = p_order_id and status = 'pending';

  -- Kenyan VAT is treated as inclusive in the launch pricing model (16/116).
  -- The clearing, revenue and VAT entries balance exactly in whole shillings.
  v_vat_kes := round(p_amount_kes::numeric * 16 / 116)::bigint;
  v_revenue_account := case v_order.product
    when 'listing_boost' then 'revenue:boosts'
    when 'featured_slot' then 'revenue:featured_slots'
    when 'dealer_plan' then 'revenue:dealer_plans'
    else null
  end;
  if v_revenue_account is null then
    raise exception 'This product cannot be fulfilled by checkout' using errcode = '0A000';
  end if;

  if not exists (
    select 1 from public.ledger_entries
     where order_id = p_order_id and account = 'assets:cashia_clearing'
  ) then
    v_journal_id := gen_random_uuid();
    insert into public.ledger_entries (journal_id, account, debit_kes, credit_kes, order_id, payment_id, memo)
    values
      (v_journal_id, 'assets:cashia_clearing', p_amount_kes, 0, p_order_id, v_payment_id, 'Payment received'),
      (v_journal_id, v_revenue_account, 0, p_amount_kes - v_vat_kes, p_order_id, v_payment_id, 'Revenue excluding VAT'),
      (v_journal_id, 'liabilities:vat_output', 0, v_vat_kes, p_order_id, v_payment_id, 'VAT output');
  end if;

  if v_order.product = 'listing_boost' then
    if v_order.listing_id is null then
      raise exception 'Boost order has no listing' using errcode = '23514';
    end if;
    update public.listings
       set boosted_until = greatest(coalesce(boosted_until, now()), now()) + interval '7 days'
     where id = v_order.listing_id and status = 'live';
    if not found then
      raise exception 'Only a live listing can be boosted' using errcode = '23514';
    end if;
  elsif v_order.product = 'featured_slot' then
    if v_order.listing_id is null then
      raise exception 'Featured order has no listing' using errcode = '23514';
    end if;
    update public.listings
       set featured_until = greatest(coalesce(featured_until, now()), now()) + interval '7 days'
     where id = v_order.listing_id and status = 'live';
    if not found then
      raise exception 'Only a live listing can be featured' using errcode = '23514';
    end if;
  elsif v_order.product = 'dealer_plan' then
    if v_order.dealer_id is null or v_order.plan_id is null then
      raise exception 'Dealer plan order is incomplete' using errcode = '23514';
    end if;
    select period into v_plan_period
      from public.plans
     where id = v_order.plan_id and is_active and price_kes = p_amount_kes;
    if not found then
      raise exception 'Dealer plan is no longer available at this price' using errcode = '23514';
    end if;
    select plan_id, current_period_end
      into v_current_plan_id, v_period_start
      from public.subscriptions
     where dealer_id = v_order.dealer_id and status in ('active', 'past_due')
     for update;
    if not found or v_current_plan_id <> v_order.plan_id or v_period_start <= now() then
      v_period_start := now();
    end if;
    v_period_end := case v_plan_period
      when 'annual' then v_period_start + interval '1 year'
      else v_period_start + interval '1 month'
    end;

    update public.dealers
       set plan_id = v_order.plan_id
     where id = v_order.dealer_id and status = 'approved';
    if not found then
      raise exception 'Only an approved dealership can activate a plan' using errcode = '23514';
    end if;

    insert into public.subscriptions (
      dealer_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end
    ) values (
      v_order.dealer_id, v_order.plan_id, 'active', v_period_start, v_period_end, false
    )
    on conflict (dealer_id) where status in ('active', 'past_due')
    do update set
      plan_id = excluded.plan_id,
      status = 'active',
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = false;
  end if;
end;
$$;

revoke all on function public.record_order_payment(uuid, text, text, bigint, public.payment_status)
  from public, anon, authenticated;
grant execute on function public.record_order_payment(uuid, text, text, bigint, public.payment_status)
  to service_role;

-- Clear expired timestamps so recommended ordering can put unpaid listings last.
create or replace function public.expire_listing_promotions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  total integer := 0;
begin
  update public.listings set boosted_until = null where boosted_until <= now();
  get diagnostics changed = row_count;
  total := total + changed;

  update public.listings set featured_until = null where featured_until <= now();
  get diagnostics changed = row_count;
  return total + changed;
end;
$$;

revoke all on function public.expire_listing_promotions() from public, anon, authenticated;
grant execute on function public.expire_listing_promotions() to service_role;

-- Dealers can assign the featured slots included in an active plan to their live cars.
create or replace function public.assign_dealer_featured_slot(p_dealer_id uuid, p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked_dealer uuid;
  v_slots smallint;
  v_used integer;
  v_already_featured boolean;
begin
  select id into v_locked_dealer
    from public.dealers
   where id = p_dealer_id and status = 'approved'
   for update;
  if not found then
    raise exception 'An approved dealership is required' using errcode = '42501';
  end if;

  select p.featured_slots into v_slots
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id and p.is_active
   where s.dealer_id = p_dealer_id
     and s.status = 'active'
     and s.current_period_end > now();
  if not found or v_slots < 1 then
    raise exception 'An active plan with featured slots is required' using errcode = '23514';
  end if;

  select coalesce(featured_until > now(), false) into v_already_featured
    from public.listings
   where id = p_listing_id and dealer_id = p_dealer_id and status = 'live';
  if not found then
    raise exception 'Choose a live car from this dealership' using errcode = '23514';
  end if;

  select count(*)::integer into v_used
    from public.listings
   where dealer_id = p_dealer_id and status = 'live' and featured_until > now();
  if not v_already_featured and v_used >= v_slots then
    raise exception 'All featured slots are in use' using errcode = '23514';
  end if;

  update public.listings
     set featured_until = greatest(coalesce(featured_until, now()), now()) + interval '7 days'
   where id = p_listing_id;
end;
$$;

revoke all on function public.assign_dealer_featured_slot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_dealer_featured_slot(uuid, uuid) to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available: run public.expire_listing_promotions() every five minutes';
    return;
  end if;

  create extension if not exists pg_cron;
  perform cron.schedule('expire-listing-promotions', '*/5 * * * *', 'select public.expire_listing_promotions()');
end;
$$;
