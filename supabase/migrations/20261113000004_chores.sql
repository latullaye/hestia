-- Hestia · 04 · Household chores: rules (chores) and what is to do on a given day (chore_occurrences).
--
-- chores.schedule (jsonb), all with optional "grace_days" (the occurrence stays open that many more days):
--   {"type": "daily", "every": 1}
--   {"type": "weekly", "weekdays": [3], "every": 1}             ISO weekdays: 1 = Monday … 7 = Sunday
--   {"type": "weekly", "weekdays": [6], "grace_days": 1}        Saturday, else carried over to Sunday
--   {"type": "monthly", "days": [1, 15]}                        -1 = last day of the month
--   {"type": "monthly", "nth": 1, "weekday": 6}                 first Saturday (nth -1 = last)
--   {"type": "yearly", "months": [5]}                           some time in May: open from the 1st to the end of the month
--   {"type": "yearly", "month": 11, "day": 15}
-- One-off tasks ("ad hoc") are chore_occurrences without a chore_id.

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  emoji text,
  description text,
  assignee_ids uuid[] not null default '{}',   -- who does it; empty: whoever
  assignment text not null default 'fixed' check (assignment in ('fixed', 'rotate')), -- rotate: each one in turn
  schedule jsonb not null,
  time_of_day text not null default 'anytime' check (time_of_day in ('morning', 'afternoon', 'evening', 'anytime')),
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
select private.setup_synced_table('chores', 'title');

create table public.chore_occurrences (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid references public.chores (id) on delete cascade,  -- null: a one-off task
  title text not null,
  emoji text,
  due_date date not null,
  due_until date,                              -- last day it can still be done; null: stays until it is done (one-off tasks)
  time_of_day text not null default 'anytime',
  assignee_ids uuid[] not null default '{}',
  status text not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  done_by uuid references public.members (id) on delete set null,
  done_at timestamptz,
  note text,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
create unique index chore_occurrences_once on public.chore_occurrences (chore_id, due_date) where chore_id is not null;
create index chore_occurrences_due on public.chore_occurrences (due_date);

-- Runs after private.touch: who did it and when, who asked for it
create or replace function private.chore_occurrence_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.updated_by);
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, new.updated_by);
  elsif new.status <> 'done' then
    new.done_at := null; new.done_by := null;
  end if;
  return new;
end $$;
create trigger v_chore_occurrence_before before insert or update on public.chore_occurrences
  for each row execute function private.chore_occurrence_before();
select private.setup_synced_table('chore_occurrences', 'title');

-- Is day d one of the rule's days? (anchor: the day the rule starts, for "every N")
create or replace function private.chore_matches(schedule jsonb, anchor date, d date) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  every int := greatest(coalesce((schedule ->> 'every')::int, 1), 1);
  dom int := extract(day from d)::int;
  dow int := extract(isodow from d)::int;
  mon int := extract(month from d)::int;
  last_dom int := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;
  months_apart int := (extract(year from d)::int - extract(year from anchor)::int) * 12 + mon - extract(month from anchor)::int;
  nth int;
begin
  case schedule ->> 'type'
    when 'daily' then
      return mod(d - anchor, every) = 0;
    when 'weekly' then
      return coalesce(schedule -> 'weekdays', '[]'::jsonb) @> to_jsonb(dow)
        and mod((date_trunc('week', d)::date - date_trunc('week', anchor)::date) / 7, every) = 0;
    when 'monthly' then
      if mod(months_apart, every) <> 0 then return false; end if;
      if schedule ? 'nth' then
        nth := (schedule ->> 'nth')::int;
        return dow = (schedule ->> 'weekday')::int
          and ((nth > 0 and (dom - 1) / 7 + 1 = nth) or (nth = -1 and dom + 7 > last_dom));
      end if;
      return coalesce(schedule -> 'days', '[]'::jsonb) @> to_jsonb(dom)
        or (dom = last_dom and coalesce(schedule -> 'days', '[]'::jsonb) @> '-1'::jsonb);
    when 'yearly' then
      if schedule ? 'day' then
        return mon = (schedule ->> 'month')::int and dom = (schedule ->> 'day')::int;
      end if;
      return dom = 1 and coalesce(schedule -> 'months', '[]'::jsonb) @> to_jsonb(mon);
    else
      return false;
  end case;
end $$;

-- Last day an occurrence of day d stays open
create or replace function private.chore_until(schedule jsonb, d date) returns date
language sql immutable set search_path = '' as $$
  select case
    when schedule ->> 'type' = 'yearly' and not schedule ? 'day'
      then (date_trunc('month', d) + interval '1 month - 1 day')::date
    else d + coalesce((schedule ->> 'grace_days')::int, 0)
  end
$$;

-- Writes the occurrences of the coming days (idempotent). p_chore: only this rule; null: all of them.
-- Called every night by pg_cron and whenever a rule changes.
create or replace function public.generate_chore_occurrences(p_chore uuid default null, p_horizon int default 60)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  today date := private.today();
  d date;
  until_d date;
  first_d date;
  n int;
  who uuid[];
  made int := 0;
  touched int;
begin
  for c in
    select * from public.chores
    where active and deleted_at is null and (p_chore is null or id = p_chore)
  loop
    -- Look back far enough to catch a window that is still open (a weekend started yesterday, a month started on the 1st)
    first_d := today - case when c.schedule ->> 'type' = 'yearly' and not c.schedule ? 'day' then 31
                            else coalesce((c.schedule ->> 'grace_days')::int, 0) end;
    select count(*) into n from public.chore_occurrences o
      where o.chore_id = c.id and o.due_date < first_d and o.deleted_at is null;
    for d in select generate_series(first_d, today + p_horizon, interval '1 day')::date loop
      continue when not private.chore_matches(c.schedule, c.start_date, d);
      until_d := private.chore_until(c.schedule, d);
      continue when until_d < greatest(today, c.start_date);
      continue when c.end_date is not null and d > c.end_date;
      who := case when c.assignment = 'rotate' and cardinality(c.assignee_ids) > 0
                  then array[c.assignee_ids[mod(n, cardinality(c.assignee_ids)) + 1]]
                  else c.assignee_ids end;
      n := n + 1;
      insert into public.chore_occurrences as o (chore_id, title, emoji, due_date, due_until, time_of_day, assignee_ids, updated_via)
      values (c.id, c.title, c.emoji, d, until_d, c.time_of_day, who, 'system')
      on conflict (chore_id, due_date) where chore_id is not null do update
        set title = excluded.title, emoji = excluded.emoji, due_until = excluded.due_until,
            time_of_day = excluded.time_of_day, assignee_ids = excluded.assignee_ids,
            deleted_at = null, updated_via = 'system'
        where o.status = 'todo' and (o.deleted_at is not null
          or (o.title, o.emoji, o.due_until, o.time_of_day, o.assignee_ids)
             is distinct from (excluded.title, excluded.emoji, excluded.due_until, excluded.time_of_day, excluded.assignee_ids));
      get diagnostics touched = row_count;
      made := made + touched;
    end loop;
  end loop;
  return made;
end $$;
revoke execute on function public.generate_chore_occurrences(uuid, int) from public, anon, authenticated;
grant execute on function public.generate_chore_occurrences(uuid, int) to service_role;

-- A rule changes: what was still to do is withdrawn, then written again from the new rule
create or replace function private.chore_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.title, new.emoji, new.assignee_ids, new.assignment, new.schedule, new.time_of_day,
        new.start_date, new.end_date, new.active, new.deleted_at)
      is not distinct from (old.title, old.emoji, old.assignee_ids, old.assignment, old.schedule, old.time_of_day,
        old.start_date, old.end_date, old.active, old.deleted_at) then
    return null;
  end if;
  update public.chore_occurrences set deleted_at = now(), updated_via = 'system'
    where chore_id = new.id and status = 'todo' and deleted_at is null
      and coalesce(due_until, due_date) >= private.today();
  if new.active and new.deleted_at is null then
    perform public.generate_chore_occurrences(new.id);
  end if;
  return null;
end $$;
create trigger z_chore_changed after insert or update on public.chores
  for each row execute function private.chore_changed();
