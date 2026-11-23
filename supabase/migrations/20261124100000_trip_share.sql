-- Hestia · "Partager ma position" is the trip's own choice, kept on the trip (it was only on the phone): the switch now
-- stops OwnTracks too, not only the app. Turned off, the point already kept is wiped and new ones are not kept; being
-- near home still ends the trip (the point is read, not kept).
alter table public.arrivals add column share_location boolean not null default true;
comment on column public.arrivals.share_location is 'Where the person is may be kept and seen during the trip (app and OwnTracks). Off: nothing is kept.';

-- Returns: 'ok', 'home' (the trip just ended), 'off' (not shared: not kept), 'no_trip', 'old'.
create or replace function private.record_location(p_member uuid, p_lat double precision, p_lng double precision, p_accuracy real,
  p_at timestamptz, p_via text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  trip public.arrivals;
  home jsonb := (select value -> 'home' from public.settings where id = 'household');
begin
  if p_member is null or p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return 'no_trip'; end if;
  select * into trip from public.arrivals
  where member_id = p_member and deleted_at is null and arrived_at is null and eta > now() - interval '1 hour'
  order by created_at desc limit 1;
  if not found then return 'no_trip'; end if;
  if p_at < now() - interval '15 minutes' then return 'old'; end if;
  if trip.share_location then
    insert into public.arrival_locations as l (id, lat, lng, accuracy, located_at, via)
    values (trip.id, p_lat, p_lng, p_accuracy, least(p_at, now()), p_via)
    on conflict (id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
      located_at = excluded.located_at, via = excluded.via, deleted_at = null
    where l.located_at is null or excluded.located_at >= l.located_at;
  end if;
  -- Home: the trip ends by itself (not in the first two minutes: one may say "je rentre" while still at the door)
  if home ? 'lat' and home ? 'lng' and trip.left_at < now() - interval '2 minutes'
     and private.distance_m(p_lat, p_lng, (home ->> 'lat')::double precision, (home ->> 'lng')::double precision) < 150 then
    update public.arrivals set arrived_at = now(), updated_via = 'system' where id = trip.id;
    return 'home';
  end if;
  return case when trip.share_location then 'ok' else 'off' end;
end $$;

-- Turned off during the trip: where the person was is wiped at once
create or replace function private.arrival_unshare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.arrival_locations set lat = null, lng = null, accuracy = null, deleted_at = now() where id = new.id and deleted_at is null;
  return null;
end $$;
create trigger z_arrival_unshare after update of share_location on public.arrivals
  for each row when (not new.share_location) execute function private.arrival_unshare();

-- The news of a trip follows what the others are told (time, word, who, over), not the sharing switch
drop trigger z_arrival_notify on public.arrivals;
create trigger z_arrival_notify after insert or update of eta, note, from_label, notify_ids, arrived_at, deleted_at on public.arrivals
  for each row execute function private.arrival_notify();

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
