-- Hestia · Notifications write dates and times as people say them: "ven. 20 nov. à 19 h", "17 h 32".

-- "ven. 20 nov." (no locale needed on the server)
create or replace function private.day_fr(d date) returns text
language sql immutable set search_path = '' as $$
  select (array['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'])[extract(dow from d)::int + 1] || ' ' || extract(day from d)::int || ' '
      || (array['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'])[extract(month from d)::int]
$$;

-- "19 h", "19 h 30"
create or replace function private.time_fr(t time) returns text
language sql immutable set search_path = '' as $$
  select extract(hour from t)::int || ' h' || case when extract(minute from t) = 0 then '' else ' ' || to_char(t, 'MI') end
$$;

create or replace function private.event_when(e public.events) returns text
language sql stable security definer set search_path = '' as $$
  select case when e.all_day then private.day_fr(e.start_date)
    else private.day_fr((e.starts_at at time zone private.tz())::date) || ' à ' || private.time_fr((e.starts_at at time zone private.tz())::time) end
$$;

create or replace function private.arrival_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  at text := private.time_fr((new.eta at time zone private.tz())::time);
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

create or replace function private.stay_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  what text;
  dates text := case when new.start_date = new.end_date then 'le ' || private.day_fr(new.start_date)
                     else 'du ' || private.day_fr(new.start_date) || ' au ' || private.day_fr(new.end_date) end;
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then return null; end if;
    what := case when new.status = 'planned' then ' propose' else ' a prévu' end;
  elsif old.deleted_at is null and new.deleted_at is not null then what := ' a annulé';
  elsif new.deleted_at is not null then return null;
  elsif old.status = 'planned' and new.status = 'confirmed' then what := ' a confirmé';
  elsif (old.start_date, old.end_date) is distinct from (new.start_date, new.end_date) then what := ' a changé les dates';
  else return null;
  end if;
  for who in select m.id from public.members m
             where m.role = 'adult' and m.active and m.deleted_at is null and m.id is distinct from new.updated_by loop
    insert into public.notifications (member_id, kind, title, body, url, data)
    values (who, 'stay', private.member_name(new.updated_by) || what || ' : ' || private.stay_label(new),
      dates || case when new.status = 'planned' and new.deleted_at is null then ' · à confirmer' else '' end || coalesce(' · ' || nullif(new.note, ''), ''),
      '#/calendar', jsonb_build_object('stay_id', new.id));
  end loop;
  return null;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
