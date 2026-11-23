-- Hestia · The TV poster is drawn by a GitHub workflow, but GitHub's own schedule skips runs when its servers are busy
-- (once in six hours, one night). The database's clock, which already sends the reminders, asks for it instead every
-- 30 minutes: the poster function asks GitHub to run the workflow (secrets GITHUB_POSTER_TOKEN and GITHUB_POSTER_REPO).
-- The workflow's own schedule stays as a fallback; a run with nothing new sends nothing.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  perform cron.schedule('hestia-poster', '2,32 * * * *', $c$select private.call_function('poster', '{}'::jsonb)$c$);
end $$;
