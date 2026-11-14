-- Hestia · 07 · Housekeeping: old reminder marks and old notifications are forgotten, once a day.
create or replace function private.cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.sent where at < now() - interval '14 days';
  delete from public.notifications where created_at < now() - interval '90 days';
end $$;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today() to authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  perform cron.schedule('hestia-cleanup', '30 9 * * *', 'select private.cleanup()');
end $$;
