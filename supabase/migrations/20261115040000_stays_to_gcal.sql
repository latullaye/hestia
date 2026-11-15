-- Hestia · A stay away from home also appears in Google Calendar "Family": it is mirrored by an all-day event, which goes
-- to Google like any other (gcal_dirty, then the gcal-sync function). Hestia's own screens show the stay, not the event.
-- From Google back: moving the event moves the stay's dates; deleting it cancels the stay. Its title is the stay's.

alter table public.events add column stay_id uuid references public.stays (id) on delete set null;
create unique index events_stay on public.events (stay_id) where stay_id is not null;

create or replace function private.stay_to_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  label text := private.stay_label(new) || coalesce(' · ' || nullif(new.note, ''), '') || case when new.status = 'planned' then ' (à confirmer)' else '' end;
  how text := concat_ws(' · ',
    case new.transport when 'car' then 'En voiture' when 'bus' then 'En bus' when 'train' then 'En train' when 'plane' then 'En avion' end,
    case when new.transport = 'car' and new.carshare then case when new.carshare_booked then 'Communauto réservée' else 'Communauto à réserver' end end);
  starts timestamptz := new.start_date::timestamp at time zone private.tz();
  ends timestamptz := (new.end_date + 1)::timestamp at time zone private.tz();
begin
  if new.updated_via = 'gcal' then return null; end if; -- the change came from Google, through the event itself
  -- Written as 'system': the stay's own change is already in the journal
  if exists (select 1 from public.events where stay_id = new.id) then
    update public.events set title = label, description = nullif(how, ''), all_day = true, start_date = new.start_date, end_date = new.end_date,
      starts_at = starts, ends_at = ends, participant_ids = new.member_ids, status = 'confirmed', deleted_at = new.deleted_at,
      updated_by = new.updated_by, updated_via = 'system'
    where stay_id = new.id;
  elsif new.deleted_at is null then
    insert into public.events (title, description, all_day, start_date, end_date, starts_at, ends_at, kind, participant_ids, status, stay_id,
      created_by, updated_by, updated_via)
    values (label, nullif(how, ''), true, new.start_date, new.end_date, starts, ends, 'travel', new.member_ids, 'confirmed', new.id,
      new.updated_by, new.updated_by, 'system');
  end if;
  return null;
end $$;
create trigger z_stay_to_event after insert or update on public.stays for each row execute function private.stay_to_event();

-- Google moved or deleted the event: the stay follows
create or replace function private.event_to_stay() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stay_id is null or new.updated_via <> 'gcal' then return null; end if;
  if new.deleted_at is not null and old.deleted_at is null then
    update public.stays set deleted_at = now(), updated_by = null, updated_via = 'gcal' where id = new.stay_id and deleted_at is null;
  elsif new.deleted_at is null and new.start_date is not null
        and (new.start_date, new.end_date) is distinct from (old.start_date, old.end_date) then
    update public.stays set start_date = new.start_date, end_date = greatest(new.start_date, coalesce(new.end_date, new.start_date)),
      updated_by = null, updated_via = 'gcal'
    where id = new.stay_id and deleted_at is null;
  end if;
  return null;
end $$;
create trigger z_event_to_stay after update on public.events for each row execute function private.event_to_stay();

-- The stays already there get their event
update public.stays set updated_via = 'system' where deleted_at is null;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_family(), private.is_adult(), private.current_member_id(), private.random_token(), private.tz(), private.today(),
  private.gift_visible(uuid, uuid) to authenticated;
