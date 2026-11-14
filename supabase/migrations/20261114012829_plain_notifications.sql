-- Hestia · 08 · Notifications in plain words: no emoji in their titles (the app draws its own icons).
-- Approval flow: asked -> the approvers are told; decided -> the one who asked is told
create or replace function private.event_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  asker uuid := coalesce(new.created_by, new.updated_by);
begin
  if new.deleted_at is not null then return null; end if;
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    foreach who in array new.approver_ids loop
      continue when who = new.updated_by;
      insert into public.notifications (member_id, kind, title, body, url, data)
      values (who, 'approval_request', 'Demande d''approbation',
        private.member_name(asker) || ' : ' || new.title || ' (' || private.event_when(new) || ')',
        '#/event/' || new.id, jsonb_build_object('event_id', new.id));
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('confirmed', 'declined')
        and asker is not null and asker is distinct from new.updated_by then
    insert into public.notifications (member_id, kind, title, body, url, data)
    values (asker, 'approval_decision',
      case new.status when 'confirmed' then 'Approuvé' else 'Refusé' end,
      new.title || ' (' || private.event_when(new) || ') · ' || private.member_name(new.updated_by)
        || coalesce(' : ' || nullif(new.approval_note, ''), ''),
      '#/event/' || new.id, jsonb_build_object('event_id', new.id));
  end if;
  return null;
end $$;
