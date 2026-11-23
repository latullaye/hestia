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

-- ---------- Dates as people say them ----------
do $$ begin
  assert private.day_fr('2026-11-20') = 'ven. 20 nov.', private.day_fr('2026-11-20');
  assert private.time_fr('19:00') = '19 h' and private.time_fr('07:05') = '7 h 05', private.time_fr('07:05');
end $$;

-- ---------- Away: the chores of a stay's days are passed, and come back when it is cancelled ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
insert into public.chores (id, title, assignee_ids, schedule) values
  ('40000000-0000-0000-0000-000000000009', 'Plantes', '{10000000-0000-0000-0000-000000000002}', '{"type":"daily"}');
insert into public.stays (id, place, start_date, end_date) values
  ('70000000-0000-0000-0000-000000000001', 'Chez Mamie', private.today() + 2, private.today() + 4);
do $$
declare o record;
begin
  assert (select count(*) from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000009' and status = 'skipped'
    and stay_id = '70000000-0000-0000-0000-000000000001') = 3, 'three days away, three chores passed';
  select * into o from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000009' and due_date = private.today() + 1;
  assert o.status = 'todo', 'the day before stays to do';
end $$;
update public.stays set end_date = private.today() + 3 where id = '70000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select status from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000009' and due_date = private.today() + 4) = 'todo', 'a shorter stay gives the day back';
end $$;
update public.stays set member_ids = '{10000000-0000-0000-0000-000000000001}' where id = '70000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000009' and status = 'skipped') = 0, 'Sam stays home: Sam''s chores stay';
end $$;
update public.stays set member_ids = '{}', deleted_at = now() where id = '70000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000009' and status = 'skipped') = 0, 'a cancelled stay passes nothing';
end $$;

-- ---------- A stay only planned passes nothing; the other adult is told ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
insert into public.stays (id, place, start_date, end_date, status, note) values
  ('70000000-0000-0000-0000-000000000002', 'Chez Mamie', private.today() + 2, private.today() + 3, 'planned', 'sa fête');
do $$ begin
  assert (select count(*) from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000009' and status = 'skipped') = 0, 'planned: nothing passed';
end $$;
update public.stays set status = 'confirmed' where id = '70000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) from public.chore_occurrences where chore_id = '40000000-0000-0000-0000-000000000009' and status = 'skipped') = 2, 'confirmed: two days passed';
end $$;
update public.stays set deleted_at = now() where id = '70000000-0000-0000-0000-000000000002';
reset role;
do $$ begin
  assert (select count(*) from public.notifications where kind = 'stay' and member_id = '10000000-0000-0000-0000-000000000001'
    and data ->> 'stay_id' = '70000000-0000-0000-0000-000000000002') = 3, 'Alex told: proposed, confirmed, cancelled';
  assert (select count(*) from public.notifications where kind = 'stay' and member_id = '10000000-0000-0000-0000-000000000002') = 0, 'the author is not told';
  assert exists (select 1 from public.notifications where kind = 'stay' and title = 'Sam propose : Chez Mamie' and body like '% · à confirmer · sa fête'), 'proposal text';
end $$;

-- ---------- A stay is mirrored by an all-day event for Google; Google's changes come back to the stay ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.stays (id, place, start_date, end_date, status, note, transport, carshare) values
  ('70000000-0000-0000-0000-000000000003', 'Lac-Joli', private.today() + 10, private.today() + 12, 'planned', 'une fête', 'car', true);
reset role;
do $$
declare e public.events;
begin
  select * into e from public.events where stay_id = '70000000-0000-0000-0000-000000000003';
  assert e.title = 'À Lac-Joli · une fête (à confirmer)', 'title: ' || e.title;
  assert e.all_day and e.start_date = private.today() + 10 and e.end_date = private.today() + 12, 'dates';
  assert e.description = 'En voiture · Communauto à réserver', 'description: ' || coalesce(e.description, '');
  assert e.gcal_dirty and e.kind = 'travel' and e.status = 'confirmed', 'to be sent to Google, without an approval';
  assert (select count(*) from public.activity_log where entity_type = 'events' and entity_id = e.id::text) = 0, 'not logged twice';
end $$;
update public.stays set status = 'confirmed', start_date = private.today() + 11 where id = '70000000-0000-0000-0000-000000000003';
do $$ begin
  assert (select title from public.events where stay_id = '70000000-0000-0000-0000-000000000003') = 'À Lac-Joli · une fête', 'confirmed: no mark';
  assert (select start_date from public.events where stay_id = '70000000-0000-0000-0000-000000000003') = private.today() + 11, 'moved';
end $$;
-- Moved in Google, then deleted in Google
update public.events set start_date = private.today() + 14, end_date = private.today() + 15, updated_via = 'gcal'
where stay_id = '70000000-0000-0000-0000-000000000003';
do $$ begin
  assert (select (start_date, end_date) = (private.today() + 14, private.today() + 15) from public.stays where id = '70000000-0000-0000-0000-000000000003'), 'the stay follows Google';
end $$;
update public.events set deleted_at = now(), updated_via = 'gcal' where stay_id = '70000000-0000-0000-0000-000000000003';
do $$ begin
  assert (select deleted_at is not null from public.stays where id = '70000000-0000-0000-0000-000000000003'), 'deleted in Google: the stay is cancelled';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);

-- ---------- On the way home: the others are told, again when the time moves by 5 minutes or more ----------
insert into public.arrivals (id, member_id, from_label, left_at, eta, notify_ids) values
  ('71000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'du bureau', now(), now() + interval '30 minutes',
   '{10000000-0000-0000-0000-000000000001,10000000-0000-0000-0000-000000000002}');
do $$ begin
  assert (select member_id from public.arrivals where id = '71000000-0000-0000-0000-000000000001') = '10000000-0000-0000-0000-000000000002', 'who comes is who writes';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where kind = 'arrival') = 1, 'one person told (not the one coming)';
  assert (select body from public.notifications where kind = 'arrival') like 'Part du bureau · arrivée vers %', 'body: ' || (select body from public.notifications where kind = 'arrival');
  assert (select send_after > now() + interval '40 seconds' from public.notifications where kind = 'arrival'), 'the news waits 45 seconds';
  assert (select url from public.notifications where kind = 'arrival') = '#/trip/71000000-0000-0000-0000-000000000001', 'opens the trip';
end $$;
-- Adjusting while it waits: still one notification, with the last time
update public.arrivals set eta = eta + interval '2 minutes' where id = '71000000-0000-0000-0000-000000000001';
update public.arrivals set eta = eta + interval '10 minutes' where id = '71000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.notifications where kind = 'arrival') = 1, 'adjustments are told once';
  assert (select (data ->> 'eta')::timestamptz from public.notifications where kind = 'arrival')
    = (select eta from public.arrivals where id = '71000000-0000-0000-0000-000000000001'), 'with the final time';
end $$;
-- Sent (as if 45 seconds went by); then a later time is new news, compared with what was told
update public.notifications set send_after = now() - interval '1 second' where kind = 'arrival';
update public.arrivals set eta = eta + interval '10 minutes' where id = '71000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.notifications where kind = 'arrival') = 2, 'a real change is told';
  assert (select title from public.notifications where kind = 'arrival' and send_after > now()) like '% plus tard', 'later';
  assert (select body from public.notifications where kind = 'arrival' and send_after > now()) like 'Nouvelle heure : % (au lieu de %)%', 'new time and old one: ' || (select body from public.notifications where kind = 'arrival' and send_after > now());
end $$;
-- Back to the time they know before it went out: nothing to say
update public.arrivals set eta = eta - interval '10 minutes' where id = '71000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.notifications where kind = 'arrival') = 1, 'nothing new: the pending news is dropped';
end $$;
update public.arrivals set note = 'Je passe chercher les pizzas' where id = '71000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select title from public.notifications where kind = 'arrival' and send_after > now()) like '% a laissé un mot', 'a word alone';
  assert (select body from public.notifications where kind = 'arrival' and send_after > now()) like '« Je passe chercher les pizzas »%', 'the word';
end $$;

-- ---------- Where someone on the way home is: during the trip only, by them only; home ends the trip ----------
update public.settings set value = value || '{"home": {"lat": 45.5, "lng": -73.6}}' where id = 'household';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
do $$ begin
  assert public.share_location(45.6, -73.6, 10) = 'ok', 'on a trip: kept';
  assert (select lat from public.arrival_locations where id = '71000000-0000-0000-0000-000000000001') = 45.6, 'the family sees it';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  assert public.share_location(45.7, -73.6, 10) = 'no_trip', 'no trip: nothing kept';
  begin
    update public.arrival_locations set lat = 1 where id = '71000000-0000-0000-0000-000000000001';
    assert (select lat from public.arrival_locations where id = '71000000-0000-0000-0000-000000000001') = 45.6, 'nobody writes it directly';
  exception when insufficient_privilege then null;
  end;
end $$;
create temp table k as select public.create_location_key() as tok;
reset role;
do $$ begin
  assert private.location_key_member((select tok from k)) = '10000000-0000-0000-0000-000000000001', 'the key says whose it is';
  assert private.location_key_member('hsl_nope') is null, 'an unknown key is nobody';
  assert private.record_location('10000000-0000-0000-0000-000000000002', 45.8, -73.6, 5, now() - interval '5 minutes', 'owntracks') = 'ok', 'late point';
  assert (select lat from public.arrival_locations where id = '71000000-0000-0000-0000-000000000001') = 45.6, 'an older point does not replace a newer one';
  assert private.record_location('10000000-0000-0000-0000-000000000002', 45.8, -73.6, 5, now() - interval '20 minutes', 'owntracks') = 'old', 'stale point';
  -- At the door, just after saying "je rentre": not home yet
  assert private.record_location('10000000-0000-0000-0000-000000000002', 45.5005, -73.6, 5, now(), 'owntracks') = 'ok', 'not in the first minutes';
end $$;
update public.arrivals set left_at = now() - interval '20 minutes', updated_via = 'system' where id = '71000000-0000-0000-0000-000000000001';
do $$ begin
  assert private.record_location('10000000-0000-0000-0000-000000000002', 45.5005, -73.6, 5, now(), 'owntracks') = 'home', 'home';
  assert (select arrived_at is not null from public.arrivals where id = '71000000-0000-0000-0000-000000000001'), 'the trip ends by itself';
  assert (select lat is null and deleted_at is not null from public.arrival_locations where id = '71000000-0000-0000-0000-000000000001'), 'and the point is wiped';
  assert (select count(*) from public.notifications where kind = 'arrival' and send_after > now()) = 0, 'news not sent is dropped';
end $$;

-- ---------- Notifications due later: not pushed at once, sent by the 15-second job ----------
do $$ begin
  perform private.push_due(); -- (no functions address in tests: it only must not fail)
end $$;

-- ---------- Gifts: hidden from the person they are for, unless they wrote it; the kiosk sees none ----------
insert into public.gift_people (id, name, member_id, updated_via) values
  ('60000000-0000-0000-0000-000000000001', 'Sam', '10000000-0000-0000-0000-000000000002', 'system'),
  ('60000000-0000-0000-0000-000000000002', 'Mamie', null, 'system');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.gifts (id, person_id, title, occasion, year, created_by) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Surprise pour Sam', 'christmas', 2026, '10000000-0000-0000-0000-000000000002'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Écharpe', null, null, null);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
insert into public.gifts (id, person_id, title) values ('61000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', 'Envie de Sam');
do $$ begin
  assert (select count(*) from public.gifts) = 2, 'Sam sees the idea for Mamie and their own wish, not the surprise';
  assert not exists (select 1 from public.gifts where id = '61000000-0000-0000-0000-000000000001'), 'the surprise is hidden from Sam';
  update public.gifts set title = 'Gâché' where id = '61000000-0000-0000-0000-000000000001';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  assert (select count(*) from public.gifts) = 3, 'Alex sees everything about Sam and Mamie';
  assert (select created_by from public.gifts where id = '61000000-0000-0000-0000-000000000001') = '10000000-0000-0000-0000-000000000001', 'created_by cannot be forged';
  assert (select title from public.gifts where id = '61000000-0000-0000-0000-000000000001') = 'Surprise pour Sam', 'Sam could not change a hidden present';
end $$;
update public.gifts set bought_at = now() where id = '61000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select bought_by from public.gifts where id = '61000000-0000-0000-0000-000000000002') = '10000000-0000-0000-0000-000000000001', 'bought_by';
  update public.gifts set kind = 'stocking' where id = '61000000-0000-0000-0000-000000000001';
  begin
    update public.gifts set kind = 'sack' where id = '61000000-0000-0000-0000-000000000001';
    assert false, 'an unknown kind of present must be refused';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', false);
do $$ begin
  assert (select count(*) from public.gifts) = 0 and (select count(*) from public.gift_people) = 0, 'the kiosk sees no gifts';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.activity_log where entity_type in ('gifts', 'gift_people')) = 0, 'gifts never reach the shared log';
end $$;

-- ---------- Notification preferences: personal, kept out of the journal, always an object ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
update public.members set notify_prefs = '{"off": ["digest"], "quiet": {"from": "22:00", "to": "07:00"}}' where id = '10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', false);
do $$ begin
  update public.members set notify_prefs = '{}' where id = '10000000-0000-0000-0000-000000000001';
  assert (select notify_prefs ->> 'off' from public.members where id = '10000000-0000-0000-0000-000000000001') = '["digest"]', 'the kiosk cannot change them';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.activity_log where entity_type = 'members' and data ? 'notify_prefs') = 0, 'preferences stay out of the journal';
  begin
    update public.members set notify_prefs = '[]' where id = '10000000-0000-0000-0000-000000000001';
    assert false, 'preferences must be an object';
  exception when check_violation then null;
  end;
end $$;

-- ---------- The TV poster's clock (20261123100000): a pg_cron job only, absent from this test database ----------
do $$ declare n int; begin
  if to_regclass('cron.job') is null then return; end if;
  execute $q$select count(*) from cron.job where jobname = 'hestia-poster'$q$ into n;
  assert n = 1, 'with pg_cron, the poster is asked for every 30 minutes';
end $$;

-- ---------- A member removed for good: nothing blocks, their name leaves the rows ----------
-- (rolled back: the tool tests that follow use the same family)
begin;
delete from public.members where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select created_by from public.events where id = '30000000-0000-0000-0000-000000000001') is null, 'created_by is emptied';
  assert (select count(*) from public.activity_log where actor_id = '10000000-0000-0000-0000-000000000001') = 0, 'the log forgets the author, keeps the lines';
end $$;
rollback;
