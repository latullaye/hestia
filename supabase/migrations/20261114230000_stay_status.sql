-- Hestia · A stay can be only planned (not confirmed yet). Only a confirmed stay passes chores and meals.
-- The other adults are told when a stay is proposed or added, confirmed, moved or cancelled.

alter table public.stays add column status text not null default 'confirmed' check (status in ('planned', 'confirmed'));

create or replace function private.away(p_day date, p_who uuid[]) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.stays s
  where s.deleted_at is null and s.status = 'confirmed' and p_day between s.start_date and s.end_date
    and (cardinality(s.member_ids) = 0 or (cardinality(p_who) > 0 and p_who <@ s.member_ids))
  order by s.start_date limit 1
$$;

-- "À Chelsea", "Chez Mamie", "Vacances · Mexique" (the same words as the app's stayLabel)
create or replace function private.stay_label(s public.stays) returns text
language sql immutable set search_path = '' as $$
  select case when s.kind = 'vacation' then 'Vacances · ' || s.place
              when s.place ~* '^(chez|au|aux|à|en)\s' then upper(left(s.place, 1)) || substr(s.place, 2)
              else 'À ' || s.place end
$$;

create or replace function private.stay_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  what text;
  dates text := case when new.start_date = new.end_date then 'le ' || to_char(new.start_date, 'DD/MM')
                     else 'du ' || to_char(new.start_date, 'DD/MM') || ' au ' || to_char(new.end_date, 'DD/MM') end;
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
create trigger z_stay_notify after insert or update on public.stays for each row execute function private.stay_notify();

-- Confirming (or un-confirming) a stay changes which chores are passed: the days are looked at again
create or replace function private.stay_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.chore_occurrences set updated_via = 'system'
  where deleted_at is null and chore_id is not null and due_date >= private.today() - 1
    and ((status = 'todo' and due_date between new.start_date and new.end_date) or stay_id = new.id);
  return null;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
