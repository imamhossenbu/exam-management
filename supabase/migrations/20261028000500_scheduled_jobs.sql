-- =============================================================================
-- Server-side finalization of expired attempts.
--
-- Attempts are also finalized lazily (on save, submit, start, and whenever the
-- teacher opens attempt lists), so correctness never depends on this job.
-- The job simply makes sure abandoned attempts are graded promptly.
--
-- Requires the pg_cron extension (Dashboard → Database → Extensions → pg_cron).
-- If pg_cron is not enabled when this migration runs, nothing is scheduled;
-- enable it and re-run the block below from the SQL editor.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'finalize-expired-attempts';
    perform cron.schedule(
      'finalize-expired-attempts',
      '* * * * *',
      'select app_private.finalize_expired_attempts_job();'
    );
  else
    raise notice 'pg_cron not enabled; skipping schedule for finalize-expired-attempts';
  end if;
end;
$$;
