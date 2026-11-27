-- Hestia · the trips home, over time: when one says "je rentre", when one really leaves, the time first announced, and
-- when one is home. Read by the "Mes trajets" screen and by Claude (tool trajets).
--
-- 1. arrivals.first_eta: the time announced first (eta keeps moving with the adjustments). Set by the server.
-- 2. arrivals.departed_at: the real departure. From the position (the first point 200 m nearer home than where the trip
--    started: arrival_locations.start_home_m, a distance, wiped with the point), or from the "Je pars" button. Once known,
--    it stays.
-- 3. The arrival found by the position is dated by the point that was near home, not by when the server read it.

alter table public.arrivals add column first_eta timestamptz;
alter table public.arrivals add column departed_at timestamptz;
comment on column public.arrivals.first_eta is 'The time of arrival announced first (eta: the latest). Set by the server when the trip is made.';
comment on column public.arrivals.departed_at is 'When the person really left: found from the position (200 m nearer home than at the start), or given by the "Je pars" button. Once known, kept.';

alter table public.arrival_locations add column start_home_m real;
comment on column public.arrival_locations.start_home_m is 'How far from home the first point of the trip was (metres), to tell the real departure. Wiped with the point.';

-- The trips already made: their first time is in the journal (the row as it was made); otherwise the latest. The journal
-- and the authorship are left alone (nobody changed these trips).
alter table public.arrivals disable trigger audit;
alter table public.arrivals disable trigger touch;
update public.arrivals a set first_eta = coalesce(
  (select (l.data ->> 'eta')::timestamptz from public.activity_log l
   where l.entity_type = 'arrivals' and l.entity_id = a.id::text and l.action = 'create' order by l.at limit 1), a.eta);
alter table public.arrivals enable trigger touch;
alter table public.arrivals enable trigger audit;

-- Who made the trip (the server says), the time first announced (the server keeps), and a departure once known stays
create or replace function private.arrival_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.member_id := coalesce(private.current_member_id(), new.member_id);
    new.first_eta := new.eta;
  else
    if pg_trigger_depth() = 1 then new.member_id := old.member_id; end if;
    new.first_eta := coalesce(old.first_eta, old.eta);
    new.departed_at := coalesce(old.departed_at, new.departed_at);
  end if;
  return new;
end $$;

-- Returns: 'ok', 'home' (the trip just ended), 'off' (not shared: not kept), 'no_trip', 'old'.
create or replace function private.record_location(p_member uuid, p_lat double precision, p_lng double precision, p_accuracy real,
  p_at timestamptz, p_via text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  trip public.arrivals;
  loc public.arrival_locations;
  home jsonb := (select value -> 'home' from public.settings where id = 'household');
  at_ timestamptz := least(p_at, now());
  to_home double precision;
begin
  if p_member is null or p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return 'no_trip'; end if;
  select * into trip from public.arrivals
  where member_id = p_member and deleted_at is null and arrived_at is null and eta > now() - interval '1 hour'
  order by created_at desc limit 1;
  if not found then return 'no_trip'; end if;
  if p_at < now() - interval '15 minutes' then return 'old'; end if;
  if home ? 'lat' and home ? 'lng' then
    to_home := private.distance_m(p_lat, p_lng, (home ->> 'lat')::double precision, (home ->> 'lng')::double precision);
  end if;
  if trip.share_location then
    select * into loc from public.arrival_locations where id = trip.id;
    insert into public.arrival_locations as l (id, lat, lng, accuracy, located_at, via, start_home_m)
    values (trip.id, p_lat, p_lng, p_accuracy, at_, p_via, to_home)
    on conflict (id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
      located_at = excluded.located_at, via = excluded.via, deleted_at = null,
      start_home_m = coalesce(l.start_home_m, excluded.start_home_m)
    where l.located_at is null or excluded.located_at >= l.located_at;
    -- The real departure: 200 m nearer home than where the trip started (a newer point only)
    if trip.departed_at is null and to_home is not null and loc.start_home_m is not null
       and (loc.located_at is null or at_ >= loc.located_at) and loc.start_home_m - to_home >= 200 then
      update public.arrivals set departed_at = at_, updated_via = 'system' where id = trip.id;
    end if;
  end if;
  -- Home: the trip ends by itself (not in the first two minutes: one may say "je rentre" while still at the door)
  if to_home < 150 and trip.left_at < now() - interval '2 minutes' then
    update public.arrivals set arrived_at = at_, updated_via = 'system' where id = trip.id;
    return 'home';
  end if;
  return case when trip.share_location then 'ok' else 'off' end;
end $$;

-- A point wiped (trip over, sharing off) takes the start distance with it
create or replace function private.location_wiped() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then new.start_home_m := null; end if;
  return new;
end $$;
create trigger v_location_wiped before update on public.arrival_locations for each row execute function private.location_wiped();

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
