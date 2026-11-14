-- Hestia · A shopping list can point to the store's own list; gifts: who we give presents to, and the presents.

-- ---------- Shopping lists: a link (the Amazon list, the store's app…) ----------
alter table public.shopping_lists add column url text;

-- ---------- The people we give presents to ----------
-- When the person uses Hestia (member_id), what others plan for them is hidden from them (see private.gift_visible).
create table public.gift_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birthday_id uuid references public.birthdays (id) on delete set null, -- where the birthday date comes from
  member_id uuid references public.members (id) on delete set null,
  for_birthday boolean not null default true,
  for_christmas boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
comment on table public.gift_people is 'People the family gives presents to, and for which occasions (birthday, Christmas).';

-- ---------- Presents and ideas ----------
create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.gift_people (id) on delete cascade,
  title text not null,
  note text,
  url text,
  occasion text check (occasion in ('birthday', 'christmas')), -- null: an idea not tied to a date yet
  year int,
  bought_at timestamptz,
  bought_by uuid references public.members (id) on delete set null,
  wish_id uuid references public.gifts (id) on delete set null, -- the wish (written by the person) this present answers
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz,
  check ((occasion is null) = (year is null))
);
create index gifts_person on public.gifts (person_id);
comment on table public.gifts is 'Presents and gift ideas. Hidden from the person they are for, unless that person wrote them (a wish).';

-- Who wrote a present is set here, never by the app: it decides who may see it
create or replace function private.gift_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(private.current_member_id(), new.created_by, new.updated_by);
  elsif pg_trigger_depth() = 1 then
    new.created_by := old.created_by; -- (a member removed for good empties it through the foreign key, a nested trigger)
  end if;
  if new.bought_at is null then new.bought_by := null;
  elsif new.bought_by is null and pg_trigger_depth() = 1 then new.bought_by := new.updated_by; end if;
  return new;
end $$;

-- An adult sees a present unless it is meant for them and someone else wrote it. The kiosk sees no presents.
create or replace function private.gift_visible(p_person uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_adult() and (
    p_created_by = private.current_member_id()
    or not exists (select 1 from public.gift_people g where g.id = p_person and g.member_id = private.current_member_id()))
$$;

-- No audit trigger: the activity log is read by the whole family, and would give the surprise away
create trigger touch before insert or update on public.gift_people for each row execute function private.touch();
create trigger touch before insert or update on public.gifts for each row execute function private.touch();
create trigger v_gift before insert or update on public.gifts for each row execute function private.gift_before();
create index gift_people_updated_at on public.gift_people (updated_at);
create index gifts_updated_at on public.gifts (updated_at);

alter table public.gift_people enable row level security;
create policy adults on public.gift_people for all to authenticated
  using ((select private.is_adult())) with check ((select private.is_adult()));
alter table public.gifts enable row level security;
create policy adults on public.gifts for all to authenticated
  using (private.gift_visible(person_id, created_by)) with check (private.gift_visible(person_id, created_by));
revoke all on public.gift_people, public.gifts from anon;
grant select, insert, update, delete on public.gift_people, public.gifts to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.gift_people, public.gifts;
  end if;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
