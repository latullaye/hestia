-- Checks of the database rules, run by scripts/test-db.sh on a throwaway Postgres. Fictional family, nothing real.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'parent1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'parent2@example.com'),
  ('00000000-0000-0000-0000-0000000000a9', 'kiosk@example.com'),
  ('00000000-0000-0000-0000-0000000000ff', 'stranger@example.com');
insert into public.members (id, auth_user_id, name, role, needs_caregiver, updated_via) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Alex', 'adult', false, 'system'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'Sam', 'adult', false, 'system'),
  ('10000000-0000-0000-0000-000000000003', null, 'Bébé', 'child', true, 'system'),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000a9', 'Kiosque', 'device', false, 'system');

-- ---------- Access: a stranger sees nothing, the family sees everything, anon has no rights ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
do $$ begin
  assert (select count(*) from public.members) = 0, 'a stranger must not see the members';
  assert (select count(*) from public.shopping_lists) = 0, 'a stranger must not see the lists';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  assert (select count(*) from public.members) = 4, 'the family sees its members';
  assert (select count(*) from public.shopping_lists) = 5, 'the family sees the lists';
end $$;
reset role;
do $$ begin
  assert not has_table_privilege('anon', 'public.events', 'select'), 'anon must have no access to events';
  assert not has_table_privilege('anon', 'public.activity_log', 'select'), 'anon must have no access to the log';
  assert not has_table_privilege('authenticated', 'public.activity_log', 'insert'), 'the log is written by triggers only';
end $$;

-- ---------- Authors: an adult cannot write as someone else; the kiosk says who touched it ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.shopping_items (id, list_id, name, updated_by)
select '20000000-0000-0000-0000-000000000001', id, 'Œufs', '10000000-0000-0000-0000-000000000002'
from public.shopping_lists where name = 'Épicerie';
do $$ begin
  assert (select updated_by from public.shopping_items where id = '20000000-0000-0000-0000-000000000001')
    = '10000000-0000-0000-0000-000000000001', 'updated_by is forced to the signed-in adult';
  assert (select name_key from public.shopping_items where id = '20000000-0000-0000-0000-000000000001') = 'oeufs', 'name_key';
end $$;
-- Bought, from the kiosk, by Sam
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', false);
update public.shopping_items set needed = false, purchased_at = now(), updated_by = '10000000-0000-0000-0000-000000000002'
where id = '20000000-0000-0000-0000-000000000001';
do $$
declare l record;
begin
  select * into l from public.activity_log where entity_type = 'shopping_items' order by id desc limit 1;
  assert l.action = 'purchased', 'a check-off is logged as purchased, got ' || l.action;
  assert l.actor_id = '10000000-0000-0000-0000-000000000002', 'the kiosk passes who did it';
  assert l.via = 'kiosk', 'the kiosk is the source, got ' || l.via;
  assert l.label = 'Œufs', 'label';
  assert (select purchase_count from public.shopping_items where id = '20000000-0000-0000-0000-000000000001') = 1, 'purchase_count';
  assert (select count(*) from public.purchases where item = 'Œufs' and actor = 'Sam') = 1, 'purchases view';
end $$;
-- A replay of the same row writes nothing in the log
update public.shopping_items set needed = false where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.activity_log where entity_type = 'shopping_items') = 2, 'no log line for a no-op';
end $$;
-- The kiosk cannot change members or settings
do $$
declare n int;
begin
  update public.members set name = 'X' where role = 'adult';
  get diagnostics n = row_count;
  assert n = 0, 'the kiosk must not edit members';
end $$;

-- ---------- Approval flow ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.events (id, title, starts_at, ends_at, participant_ids, caregiver_ids, status, approver_ids)
values ('30000000-0000-0000-0000-000000000001', '5 à 7 collègues', now() + interval '2 days', now() + interval '2 days 2 hours',
  '{10000000-0000-0000-0000-000000000001}', '{10000000-0000-0000-0000-000000000002}', 'pending',
  '{10000000-0000-0000-0000-000000000002}');
do $$
declare e public.events; n public.notifications;
begin
  select * into e from public.events where id = '30000000-0000-0000-0000-000000000001';
  assert e.created_by = '10000000-0000-0000-0000-000000000001', 'created_by';
  assert e.gcal_dirty, 'a new event must go to Google';
  assert e.approval_requested_at is not null, 'approval_requested_at';
  select * into n from public.notifications where kind = 'approval_request';
  assert n.member_id = '10000000-0000-0000-0000-000000000002', 'the approver is notified';
  assert n.body like 'Alex : 5 à 7 collègues%', 'body: ' || n.body;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
insert into public.event_comments (event_id, author_id, body)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'OK mais rentre avant 20 h');
update public.events set status = 'confirmed', approval_decided_by = '10000000-0000-0000-0000-000000000002', approval_note = 'Amuse-toi'
where id = '30000000-0000-0000-0000-000000000001';
do $$
declare n public.notifications;
begin
  assert (select action from public.activity_log where entity_type = 'events' order by id desc limit 1) = 'approved', 'logged as approved';
  select * into n from public.notifications where kind = 'approval_decision';
  assert n.member_id = '10000000-0000-0000-0000-000000000001', 'the asker is told';
  assert n.title like 'Approuvé%' and n.body like '%Sam : Amuse-toi', 'decision text: ' || n.body;
  assert (select count(*) from public.notifications where kind = 'comment' and member_id = '10000000-0000-0000-0000-000000000001') = 1, 'comment notification';
  assert (select approval_decided_at from public.events where id = '30000000-0000-0000-0000-000000000001') is not null, 'approval_decided_at';
end $$;
-- A change coming from Google does not bounce back to Google
reset role;
update public.events set gcal_dirty = false, updated_via = 'gcal' where id = '30000000-0000-0000-0000-000000000001';
update public.events set title = '5 à 7', updated_via = 'gcal' where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  assert not (select gcal_dirty from public.events where id = '30000000-0000-0000-0000-000000000001'), 'gcal changes are not pushed back';
end $$;
-- An app working from an old copy cannot undo the Google link
update public.events set gcal_event_id = 'g-1', updated_via = 'gcal' where id = '30000000-0000-0000-0000-000000000001';
update public.events set gcal_event_id = null, location = 'Bar', updated_via = 'app' where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select gcal_event_id from public.events where id = '30000000-0000-0000-0000-000000000001') = 'g-1', 'the Google id is kept';
  assert (select gcal_dirty from public.events where id = '30000000-0000-0000-0000-000000000001'), 'and the change goes to Google';
end $$;

-- ---------- Chores ----------
do $$ begin
  assert private.chore_matches('{"type":"weekly","weekdays":[3]}', '2026-01-01', '2026-11-18'), 'Wednesday';
  assert not private.chore_matches('{"type":"weekly","weekdays":[3]}', '2026-01-01', '2026-11-19'), 'not Thursday';
  assert private.chore_matches('{"type":"weekly","weekdays":[1],"every":2}', '2026-11-02', '2026-11-16'), 'every other Monday';
  assert not private.chore_matches('{"type":"weekly","weekdays":[1],"every":2}', '2026-11-02', '2026-11-09'), 'skipped Monday';
  assert private.chore_matches('{"type":"monthly","nth":1,"weekday":6}', '2026-01-01', '2026-11-07'), 'first Saturday';
  assert private.chore_matches('{"type":"monthly","nth":-1,"weekday":6}', '2026-01-01', '2026-11-28'), 'last Saturday';
  assert private.chore_matches('{"type":"monthly","days":[-1]}', '2026-01-01', '2026-11-30'), 'last day';
  assert private.chore_matches('{"type":"yearly","months":[5]}', '2026-01-01', '2027-05-01'), 'in May';
  assert private.chore_until('{"type":"yearly","months":[5]}', '2027-05-01') = '2027-05-31', 'May window';
  assert private.chore_until('{"type":"weekly","weekdays":[6],"grace_days":1}', '2026-11-14') = '2026-11-15', 'weekend';
  assert private.chore_matches('{"type":"daily","every":2}', '2026-11-10', '2026-11-08'), 'every 2 days, before the anchor';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.chores (id, title, assignee_ids, schedule, time_of_day) values
  ('40000000-0000-0000-0000-000000000001', 'Litière', '{10000000-0000-0000-0000-000000000001}', '{"type":"daily"}', 'evening'),
  ('40000000-0000-0000-0000-000000000002', 'Salle de bain', '{10000000-0000-0000-0000-000000000001}', '{"type":"weekly","weekdays":[6],"grace_days":1}', 'anytime'),
  ('40000000-0000-0000-0000-000000000003', 'Cuisine', '{10000000-0000-0000-0000-000000000001,10000000-0000-0000-0000-000000000002}', '{"type":"daily"}', 'evening');
update public.chores set assignment = 'rotate' where id = '40000000-0000-0000-0000-000000000003';
do $$
declare n int; a uuid[]; b uuid[];
begin
  select count(*) into n from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000001' and deleted_at is null;
  assert n = 61, 'daily chore: 61 occurrences (today + 60), got ' || n;
  select count(*) into n from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000002' and deleted_at is null;
  assert n between 8 and 10, 'weekly chore: 8 to 10 occurrences, got ' || n;
  assert (select bool_and(due_until = due_date + 1) from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000002'), 'weekend window';
  select assignee_ids into a from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000003' and deleted_at is null order by due_date limit 1;
  select assignee_ids into b from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000003' and deleted_at is null order by due_date offset 1 limit 1;
  assert cardinality(a) = 1 and cardinality(b) = 1 and a <> b, 'rotation alternates';
  assert (select count(*) from public.activity_log where entity_type = 'chore_occurrences') = 0, 'generated occurrences are not logged';
end $$;
-- Done, then the rule changes: what is done stays, the rest follows the rule
update public.chore_occurrences set status = 'done'
where chore_id = '40000000-0000-0000-0000-000000000001' and due_date = (now() at time zone 'America/Toronto')::date;
update public.chores set schedule = '{"type":"weekly","weekdays":[1,4]}' where id = '40000000-0000-0000-0000-000000000001';
do $$
declare o public.chore_occurrences; n int;
begin
  select * into o from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000001' and due_date = (now() at time zone 'America/Toronto')::date;
  assert o.status = 'done' and o.done_by = '10000000-0000-0000-0000-000000000001' and o.deleted_at is null, 'done stays done';
  assert (select action from public.activity_log where entity_type = 'chore_occurrences' order by id desc limit 1) = 'done', 'logged as done';
  select count(*) into n from public.chore_occurrences
    where chore_id = '40000000-0000-0000-0000-000000000001' and deleted_at is null and status = 'todo';
  assert n between 16 and 18, 'after the rule change: 16 to 18 left, got ' || n;
  assert (select bool_and(extract(isodow from due_date) in (1, 4)) from public.chore_occurrences
    where chore_id = '40000000-0000-0000-0000-000000000001' and deleted_at is null and status = 'todo'), 'only Mondays and Thursdays';
end $$;
-- Idempotent (the server's job: the app cannot call it)
reset role;
do $$ begin
  assert public.generate_chore_occurrences() = 0, 'a second run changes nothing';
  assert not has_function_privilege('authenticated', 'public.generate_chore_occurrences(uuid, int)', 'execute'), 'server only';
end $$;
set role authenticated;
-- A one-off task given by Sam to Alex
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
insert into public.chore_occurrences (title, due_date, assignee_ids)
values ('Appeler le plombier', (now() at time zone 'America/Toronto')::date, '{10000000-0000-0000-0000-000000000001}');
do $$ begin
  assert (select count(*) from public.notifications where kind = 'task_assigned' and member_id = '10000000-0000-0000-0000-000000000001') = 1, 'task notification';
end $$;

-- ---------- Claude connector tokens ----------
do $$
declare t text;
begin
  t := public.create_mcp_token('test');
  assert t like 'hst_%' and length(t) = 68, 'token format';
  assert (select count(*) from public.list_mcp_tokens()) = 1, 'listed';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', false);
do $$ begin
  perform public.create_mcp_token('kiosk');
  assert false, 'the kiosk must not create tokens';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ---------- Dishes: what they are served as ----------
begin;
insert into public.dishes (name, courses, source) values ('Crêpes', '{breakfast,dessert}', 'Carnet de famille');
do $$ begin
  assert (select courses from public.dishes where name = 'Crêpes') = '{breakfast,dessert}', 'several courses are kept';
  begin
    insert into public.dishes (name, courses) values ('Mystère', '{brunch}');
    assert false, 'an unknown course must be refused';
  exception when check_violation then null;
  end;
end $$;
rollback;

-- ---------- A member removed for good: nothing blocks, their name leaves the rows ----------
-- (rolled back: the tool tests that follow use the same family)
begin;
delete from public.members where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select created_by from public.events where id = '30000000-0000-0000-0000-000000000001') is null, 'created_by is emptied';
  assert (select count(*) from public.activity_log where actor_id = '10000000-0000-0000-0000-000000000001') = 0, 'the log forgets the author, keeps the lines';
end $$;
rollback;
