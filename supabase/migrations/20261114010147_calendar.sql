-- Hestia · 02 · Calendar: events (mirrored with the Google "Family" calendar), approval flow, comments,
-- birthdays, countdowns.

-- ---------- Events ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  all_day boolean not null default false,
  starts_at timestamptz not null,           -- all-day: midnight of start_date in the household's time zone
  ends_at timestamptz,
  start_date date,                          -- all-day only
  end_date date,                            -- all-day only, inclusive
  kind text not null default 'event',       -- event | medical | activity | social | work | travel | birthday | other
  participant_ids uuid[] not null default '{}', -- who it concerns; empty: the whole family
  caregiver_ids uuid[] not null default '{}',   -- who looks after the participants that cannot go alone
  -- confirmed | pending (waiting for an approval) | declined | cancelled
  status text not null default 'confirmed' check (status in ('confirmed', 'pending', 'declined', 'cancelled')),
  approver_ids uuid[] not null default '{}',    -- who is asked to approve
  approval_requested_at timestamptz,
  approval_decided_by uuid references public.members (id) on delete set null,
  approval_decided_at timestamptz,
  approval_note text,
  created_by uuid references public.members (id) on delete set null,
  source text not null default 'hestia',    -- hestia | gcal (made in Google Calendar, or by another app through it)
  -- Google Calendar mirror (function gcal-sync)
  gcal_event_id text unique,
  gcal_etag text,
  gcal_recurring boolean not null default false, -- an occurrence of a recurring Google event: never pushed back
  gcal_synced_at timestamptz,
  gcal_dirty boolean not null default false,     -- changed here, not yet pushed to Google
  birthday_id uuid,                              -- a Google birthday event, shown through the birthdays table instead
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
create index events_starts_at on public.events (starts_at);
comment on table public.events is 'Family events. Hestia is where they are enriched (who, caregiver, approval); Google Calendar "Family" is kept in step.';

-- Marks what must go to Google and stamps the approval; runs after private.touch (triggers fire in alphabetical order), so updated_by is already the real author
create or replace function private.event_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.all_day and new.start_date is null then
    new.start_date := (new.starts_at at time zone private.tz())::date;
  end if;
  if new.all_day and new.end_date is null then new.end_date := new.start_date; end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, new.updated_by);
    if new.status = 'pending' then new.approval_requested_at := coalesce(new.approval_requested_at, now()); end if;
    if new.updated_via <> 'gcal' and new.deleted_at is null then new.gcal_dirty := true; end if;
    return new;
  end if;
  -- The Google link belongs to the server: an app working from an old copy must not undo it
  -- (direct writes only: a write made by another trigger or by a foreign key action goes through)
  if new.updated_via <> 'gcal' and pg_trigger_depth() = 1 then
    new.gcal_event_id := old.gcal_event_id; new.gcal_etag := old.gcal_etag; new.gcal_recurring := old.gcal_recurring;
    new.gcal_synced_at := old.gcal_synced_at; new.gcal_dirty := old.gcal_dirty; new.source := old.source;
    new.birthday_id := old.birthday_id; new.created_by := old.created_by;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'pending' then
      new.approval_requested_at := now();
      new.approval_decided_by := null; new.approval_decided_at := null;
    elsif old.status = 'pending' and new.status in ('confirmed', 'declined') then
      new.approval_decided_at := coalesce(new.approval_decided_at, now());
    end if;
  end if;
  if new.updated_via <> 'gcal' and not new.gcal_recurring and (
       (new.title, new.description, new.location, new.all_day, new.starts_at, new.ends_at, new.start_date, new.end_date,
        new.status, new.participant_ids, new.caregiver_ids, new.deleted_at)
       is distinct from
       (old.title, old.description, old.location, old.all_day, old.starts_at, old.ends_at, old.start_date, old.end_date,
        old.status, old.participant_ids, old.caregiver_ids, old.deleted_at)) then
    new.gcal_dirty := true;
  end if;
  return new;
end $$;
create trigger v_event_before before insert or update on public.events
  for each row execute function private.event_before();

select private.setup_synced_table('events', 'title');

-- ---------- Comments on an event (approval discussion) ----------
create table public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid references public.members (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
create index event_comments_event on public.event_comments (event_id);
select private.setup_synced_table('event_comments', 'body');

-- ---------- Birthdays and other yearly dates ----------
create table public.birthdays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  month int not null check (month between 1 and 12),
  day int not null check (day between 1 and 31),
  year int,                                  -- year of birth (or of the event), when known
  kind text not null default 'birthday' check (kind in ('birthday', 'anniversary', 'memorial')),
  note text,
  gift_ideas text,
  member_id uuid references public.members (id) on delete set null, -- when it is someone of the household
  gcal_recurring_id text,                    -- the Google recurring event it was recognised in
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
create index birthdays_month_day on public.birthdays (month, day);
select private.setup_synced_table('birthdays', 'name');
comment on table public.birthdays is 'Birthdays (kind birthday), couple or family dates (anniversary) and remembrance dates (memorial, shown apart).';

-- ---------- Countdowns ("days until Christmas") ----------
create table public.countdowns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  emoji text,
  target_date date not null,
  yearly boolean not null default false,     -- comes back every year on the same day
  show_on_kiosk boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
select private.setup_synced_table('countdowns', 'title');

insert into public.countdowns (title, emoji, target_date, yearly, updated_via)
values ('Noël', '🎄', make_date(extract(year from now())::int, 12, 25), true, 'system');
