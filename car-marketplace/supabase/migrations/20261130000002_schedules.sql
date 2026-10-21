-- Sprint 3 background job: the daily saved-search summary at 08:00 in Kenya (05:00 UTC).
-- The delivery job itself runs in the web app (POST /api/jobs/deliver); see README for scheduling it.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed: run queue_search_digests() daily another way';
    return;
  end if;
  perform cron.schedule('saved-search-digests', '0 5 * * *', 'select public.queue_search_digests()');
end;
$$;
