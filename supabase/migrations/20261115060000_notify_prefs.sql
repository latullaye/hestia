-- Hestia · Each person chooses what reaches their phone: topics they mute, "do not disturb" hours, how long before an
-- event the reminder comes. The shape is read by supabase/functions/_shared/notify-prefs.ts (app and notify function).
-- The inbox (public.notifications) still gets every row: only the push is skipped, or held until the quiet hours end.

alter table public.members add column notify_prefs jsonb not null default '{}'::jsonb
  constraint members_notify_prefs_object check (jsonb_typeof(notify_prefs) = 'object');
comment on column public.members.notify_prefs is 'What this person wants pushed: {off: [topics], quiet: {from, to}, event_before: minutes}.';

-- A personal setting is not a family event: changing it stays out of the journal (same function, one more quiet column)
create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  diff jsonb;
  act text;
  quiet constant text[] := array['updated_at', 'updated_by', 'updated_via', 'created_at',
    'gcal_etag', 'gcal_synced_at', 'gcal_dirty', 'name_key', 'purchase_count', 'needed_at', 'notify_prefs'];
begin
  if new.updated_via = 'system' then return null; end if; -- generated rows (chore occurrences) are not somebody's act
  if tg_op = 'INSERT' then
    act := 'create';
    diff := n - quiet;
  else
    select jsonb_object_agg(a.key, jsonb_build_array(b.value, a.value)) into diff
    from jsonb_each(n) a join jsonb_each(o) b using (key)
    where a.value is distinct from b.value and not (a.key = any (quiet));
    if diff is null then return null; end if; -- nothing really changed (a sync replay)
    act := case
      when n ->> 'deleted_at' is not null and o ->> 'deleted_at' is null then 'delete'
      when n ->> 'deleted_at' is null and o ->> 'deleted_at' is not null then 'restore'
      else 'update' end;
    if act = 'update' then
      if tg_table_name = 'shopping_items' and diff ? 'needed' then
        act := case when (n ->> 'needed')::boolean then 'needed'
                    when diff ? 'purchased_at' then 'purchased' else 'unneeded' end;
      elsif tg_table_name = 'chore_occurrences' and diff ? 'status' then
        act := case n ->> 'status' when 'done' then 'done' when 'skipped' then 'skipped' else 'reopened' end;
      elsif tg_table_name = 'events' and diff ? 'status' then
        act := case n ->> 'status'
          when 'pending' then 'approval_requested'
          when 'confirmed' then case when o ->> 'status' = 'pending' then 'approved' else 'update' end
          when 'declined' then 'declined'
          when 'cancelled' then 'cancelled'
          else 'update' end;
      end if;
    end if;
  end if;
  insert into public.activity_log (actor_id, via, action, entity_type, entity_id, label, data)
  -- (the author is looked up: a member removed for good, which sets these columns to null row by row, must not block)
  values ((select m.id from public.members m where m.id = new.updated_by), new.updated_via, act, tg_table_name, n ->> 'id', n ->> tg_argv[0], diff);
  return null;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(), private.gift_visible(uuid, uuid) to authenticated;
