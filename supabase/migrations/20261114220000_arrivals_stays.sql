-- Hestia · "Je rentre": someone on the way home tells the others when they will arrive.
--         Stays away from home (a weekend with family, holidays): the chores of those away are passed meanwhile.

-- ---------- On the way home ----------
create table public.arrivals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade, -- who is coming home
  from_label text,                                    -- where from, as said ("du bureau")
  left_at timestamptz not null default now(),
  eta timestamptz not null,
  notify_ids uuid[] not null default '{}',            -- who is told
  arrived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
comment on table public.arrivals is 'Someone on the way home and when they will arrive; the people to tell get a notification.';

-- Who is coming is whoever writes it: nobody announces someone else
create or replace function private.arrival_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.member_id := coalesce(private.current_member_id(), new.member_id);
  elsif pg_trigger_depth() = 1 then new.member_id := old.member_id; end if;
  return new;
end $$;

-- Told when the trip starts, and again when the time moves by 5 minutes or more
create or replace function private.arrival_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  at text := to_char(new.eta at time zone private.tz(), 'FMHH24" h "MI');
  mins int := greatest(0, round(extract(epoch from new.eta - new.left_at) / 60));
  later boolean := tg_op = 'UPDATE' and new.eta > old.eta;
begin
  if new.deleted_at is not null or new.arrived_at is not null then return null; end if;
  if tg_op = 'UPDATE' and abs(extract(epoch from new.eta - old.eta)) < 300 then return null; end if;
  foreach who in array new.notify_ids loop
    continue when who = new.member_id;
    insert into public.notifications (member_id, kind, title, body, url, data)
    values (who, 'arrival',
      private.member_name(new.member_id) || case when tg_op = 'INSERT' then ' rentre' when later then ' arrivera plus tard' else ' arrivera plus tôt' end,
      case when tg_op = 'INSERT' then coalesce('Part ' || nullif(new.from_label, '') || ' · ', '') || 'arrivée vers ' || at || ' (' || mins || ' min)'
           else 'Arrivée vers ' || at end,
      '#/', jsonb_build_object('arrival_id', new.id, 'eta', new.eta));
  end loop;
  return null;
end $$;

create trigger v_arrival before insert or update on public.arrivals for each row execute function private.arrival_before();
create trigger z_arrival_notify after insert or update on public.arrivals for each row execute function private.arrival_notify();
select private.setup_synced_table('arrivals', 'from_label');

-- ---------- Away from home ----------
create table public.stays (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'visit' check (kind in ('visit', 'vacation')), -- a visit (family, friends) or holidays
  place text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),      -- inclusive
  member_ids uuid[] not null default '{}',                     -- who goes; empty: the whole family
  transport text check (transport in ('car', 'bus', 'train', 'plane', 'other')),
  carshare boolean not null default false,                     -- a shared car must be booked
  carshare_booked boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
comment on table public.stays is 'Days away from home. Those away have no chores meanwhile; without everyone at home, no meals are planned.';
select private.setup_synced_table('stays', 'place');

alter table public.chore_occurrences add column stay_id uuid references public.stays (id) on delete set null; -- passed because of this stay

-- The stay that keeps these people away on that day, if any (empty assignees: the whole family must be away)
create or replace function private.away(p_day date, p_who uuid[]) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.stays s
  where s.deleted_at is null and p_day between s.start_date and s.end_date
    and (cardinality(s.member_ids) = 0 or (cardinality(p_who) > 0 and p_who <@ s.member_ids))
  order by s.start_date limit 1
$$;

-- A chore that falls while those who do it are away is passed; it comes back if the stay moves or is cancelled.
-- Runs before v_chore_occurrence_before (alphabetical order of "before" triggers).
create or replace function private.chore_away() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s uuid;
begin
  if new.chore_id is null or new.deleted_at is not null then return new; end if;
  if new.status = 'todo' then
    s := private.away(new.due_date, new.assignee_ids);
    if s is not null then new.status := 'skipped'; new.stay_id := s; end if;
  elsif new.status = 'skipped' and new.stay_id is not null then
    s := private.away(new.due_date, new.assignee_ids);
    if s is null then new.status := 'todo'; new.stay_id := null; else new.stay_id := s; end if;
  end if;
  return new;
end $$;
create trigger v_away before insert or update on public.chore_occurrences for each row execute function private.chore_away();

-- A stay written, moved or cancelled: the chores of its days (old and new) are looked at again
create or replace function private.stay_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.chore_occurrences set updated_via = 'system'
  where deleted_at is null and chore_id is not null and due_date >= private.today() - 1
    and ((status = 'todo' and due_date between new.start_date and new.end_date) or stay_id = new.id);
  return null;
end $$;
create trigger z_stay_changed after insert or update on public.stays for each row execute function private.stay_changed();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.arrivals, public.stays;
  end if;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
