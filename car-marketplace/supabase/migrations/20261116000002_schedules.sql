-- Background jobs, run by pg_cron inside the database (available on every Supabase project).
-- Plain Postgres without pg_cron (CI, the local test harness) skips this with a notice;
-- there the jobs can be run by hand: select public.expire_due_listings(); etc.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available: background jobs are not scheduled';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Hide and mark listings past their 60 days. 00:15 UTC is 03:15 in Kenya.
  perform cron.schedule('expire-due-listings', '15 0 * * *', 'select public.expire_due_listings()');

  -- Queue saved-search alerts for cars approved since the last run.
  perform cron.schedule('saved-search-alerts', '*/15 * * * *', 'select public.queue_saved_search_alerts()');
end;
$$;
