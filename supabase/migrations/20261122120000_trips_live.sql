-- Hestia · "Je rentre", second version, and notifications that can wait.
--
-- 1. A notification can be due later (notifications.send_after): a reminder put off by ten minutes from its own button,
--    or the news of a trip while its time is still being adjusted. The minute job sends what has come due.
-- 2. The news of a trip waits 45 seconds after the last change: adjusting the time three times in a row tells the
--    others once, with the final time compared with what they were last told. A trip has a word for the others (note).
-- 3. While a trip is under way, where the person is (arrival_locations): sent by the app while it is open, or by
--    OwnTracks in the background (supabase/functions/location). Only the latest point is kept, and only during the trip:
--    it is wiped when the person is home, when the trip is cancelled, and an hour after the time given. Being within
--    150 m of home (settings.household.home) ends the trip by itself.

-- ---------- Notifications due later ----------
alter table public.notifications add column send_after timestamptz;
comment on column public.notifications.send_after is 'Not pushed before this time (null: at once). Sent by private.push_due.';

create or replace function private.notification_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.send_after > now() then return null; end if; -- private.push_due sends it when it comes due
  perform private.call_function('notify', jsonb_build_object('task', 'push', 'notification_id', new.id));
  return null;
end $$;

-- Every 15 seconds. Only what came due in the last two minutes: a push held for someone's quiet hours is retried by the
-- reminders run, every 15 minutes, not here.
create or replace function private.push_due() returns void
language plpgsql security definer set search_path = '' as $$
declare
  n record;
begin
  for n in select id from public.notifications
           where pushed_at is null and send_after <= now() and send_after > now() - interval '2 minutes' loop
    perform private.call_function('notify', jsonb_build_object('task', 'push', 'notification_id', n.id));
  end loop;
  -- Where someone was is not kept once the trip is over (home, cancelled, or an hour past the time given)
  update public.arrival_locations l set lat = null, lng = null, accuracy = null, deleted_at = now()
  from public.arrivals a
  where a.id = l.id and l.deleted_at is null
    and (a.arrived_at is not null or a.deleted_at is not null or a.eta < now() - interval '1 hour');
end $$;

-- ---------- A trip's word, and its news held for 45 seconds ----------
alter table public.arrivals add column note text;
comment on column public.arrivals.note is 'A word for the others ("je passe chercher les pizzas"), sent with the news of the trip.';

-- For each person told: what they were last told is the latest arrival notification already due; a change makes (or
-- updates) one pending notification, due 45 seconds after the last change. Changing back to what they know cancels it.
create or replace function private.arrival_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  told jsonb;
  pending uuid;
  name text := private.member_name(new.member_id);
  tz text := private.tz();
  at text := private.time_fr((new.eta at time zone private.tz())::time);
  was text;
  note text := nullif(btrim(coalesce(new.note, '')), '');
  said text;
  head text;
  text_ text;
  tail text := E'\nTouche pour suivre le trajet.';
begin
  if new.deleted_at is not null or new.arrived_at is not null then
    -- Over: news not yet sent is dropped, and where the person was is wiped
    delete from public.notifications where kind = 'arrival' and pushed_at is null and send_after > now() and data ->> 'arrival_id' = new.id::text;
    update public.arrival_locations set lat = null, lng = null, accuracy = null, deleted_at = now() where id = new.id and deleted_at is null;
    return null;
  end if;
  said := case when note is not null then E'\n« ' || note || ' »' else '' end;
  foreach who in array new.notify_ids loop
    continue when who = new.member_id;
    select n.data into told from public.notifications n
    where n.member_id = who and n.kind = 'arrival' and n.data ->> 'arrival_id' = new.id::text and (n.send_after is null or n.send_after <= now())
    order by n.created_at desc limit 1;
    select n.id into pending from public.notifications n
    where n.member_id = who and n.kind = 'arrival' and n.data ->> 'arrival_id' = new.id::text and n.pushed_at is null and n.send_after > now()
    limit 1;
    if told is not null and abs(extract(epoch from new.eta - (told ->> 'eta')::timestamptz)) < 300 and note is not distinct from (told ->> 'note') then
      delete from public.notifications where id = pending; -- back to what they know: nothing to say
      continue;
    end if;
    if told is null then
      head := name || ' rentre';
      text_ := coalesce('Part ' || nullif(new.from_label, '') || ' · ', '') || 'arrivée vers ' || at || said || tail;
    elsif abs(extract(epoch from new.eta - (told ->> 'eta')::timestamptz)) >= 300 then
      was := private.time_fr(((told ->> 'eta')::timestamptz at time zone tz)::time);
      head := name || case when new.eta > (told ->> 'eta')::timestamptz then ' arrivera un peu plus tard' else ' arrivera un peu plus tôt' end;
      text_ := 'Nouvelle heure : ' || at || ' (au lieu de ' || was || ')' || said || tail;
    else
      head := name || ' a laissé un mot';
      text_ := '« ' || coalesce(note, '') || E' »\nToujours vers ' || at || tail;
    end if;
    if pending is not null then
      update public.notifications set title = head, body = text_, send_after = now() + interval '45 seconds',
        data = jsonb_build_object('arrival_id', new.id, 'eta', new.eta, 'note', note)
      where id = pending;
    else
      insert into public.notifications (member_id, kind, title, body, url, data, send_after)
      values (who, 'arrival', head, text_, '#/trip/' || new.id, jsonb_build_object('arrival_id', new.id, 'eta', new.eta, 'note', note),
              now() + interval '45 seconds');
    end if;
  end loop;
  return null;
end $$;

-- ---------- Where someone on the way home is ----------
create table public.arrival_locations (
  id uuid primary key references public.arrivals (id) on delete cascade, -- the trip
  lat double precision,
  lng double precision,
  accuracy real,                                     -- metres
  located_at timestamptz,                            -- when the phone took the point
  via text check (via in ('app', 'owntracks')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                             -- the trip is over: the point is wiped
);
comment on table public.arrival_locations is 'The latest point of someone on the way home, during the trip only. Written by private.record_location.';
create index arrival_locations_updated_at on public.arrival_locations (updated_at);
create trigger stamp before update on public.arrival_locations for each row execute function private.stamp();
alter table public.arrival_locations enable row level security;
create policy family_read on public.arrival_locations for select to authenticated using ((select private.is_family()));
revoke all on public.arrival_locations from anon;
grant select on public.arrival_locations to authenticated;

create or replace function private.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- A point from someone's phone. Kept only if they are on their way home; older points than the one kept are ignored
-- (OwnTracks sends what it queued while offline). Returns: 'ok', 'home' (the trip just ended), 'no_trip', 'old'.
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
  insert into public.arrival_locations as l (id, lat, lng, accuracy, located_at, via)
  values (trip.id, p_lat, p_lng, p_accuracy, least(p_at, now()), p_via)
  on conflict (id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
    located_at = excluded.located_at, via = excluded.via, deleted_at = null
  where l.located_at is null or excluded.located_at >= l.located_at;
  -- Home: the trip ends by itself (not in the first two minutes: one may say "je rentre" while still at the door)
  if home ? 'lat' and home ? 'lng' and trip.left_at < now() - interval '2 minutes'
     and private.distance_m(p_lat, p_lng, (home ->> 'lat')::double precision, (home ->> 'lng')::double precision) < 150 then
    update public.arrivals set arrived_at = now(), updated_via = 'system' where id = trip.id;
    return 'home';
  end if;
  return 'ok';
end $$;

-- From the app, while the "Je rentre" screen is open
create or replace function public.share_location(p_lat double precision, p_lng double precision, p_accuracy real default null) returns text
language sql security definer set search_path = '' as $$
  select private.record_location(private.current_member_id(), p_lat, p_lng, p_accuracy, now(), 'app')
$$;
revoke execute on function public.share_location(double precision, double precision, real) from public, anon;
grant execute on function public.share_location(double precision, double precision, real) to authenticated;

-- ---------- OwnTracks: one secret address per person ----------
create table private.location_keys (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  token_sha256 text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
-- A new key replaces the person's previous one
create or replace function public.create_location_key() returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.current_member_id();
  tok text := 'hsl_' || private.random_token();
begin
  if not private.is_adult() then raise exception 'adults only' using errcode = '42501'; end if;
  update private.location_keys set revoked_at = now() where member_id = me and revoked_at is null;
  insert into private.location_keys (member_id, token_sha256) values (me, private.sha256_hex(tok));
  return tok;
end $$;
create or replace function public.location_key_info() returns table (created_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select k.created_at, k.last_used_at from private.location_keys k
  where k.member_id = private.current_member_id() and k.revoked_at is null order by k.created_at desc limit 1
$$;
create or replace function public.revoke_location_key() returns void
language sql security definer set search_path = '' as $$
  update private.location_keys set revoked_at = now() where member_id = private.current_member_id() and revoked_at is null
$$;
-- Who a key belongs to (the location function), and when it was last used
create or replace function private.location_key_member(p_token text) returns uuid
language sql security definer set search_path = '' as $$
  update private.location_keys set last_used_at = now()
  where token_sha256 = private.sha256_hex(p_token) and revoked_at is null
  returning member_id
$$;
revoke execute on function public.create_location_key(), public.location_key_info(), public.revoke_location_key() from public, anon;
grant execute on function public.create_location_key(), public.location_key_info(), public.revoke_location_key() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.arrival_locations;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  begin
    perform cron.schedule('hestia-due', '15 seconds', 'select private.push_due()');
  exception when others then -- an older pg_cron: every minute
    perform cron.schedule('hestia-due', '* * * * *', 'select private.push_due()');
  end;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
