-- Hestia · 06 · What was asked to the intercom and what it did (history on the screens, debugging, usage).
create table public.intercom_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  member_id uuid references public.members (id) on delete set null, -- who spoke, when known
  device text not null default 'app',      -- app | kiosk
  text text not null,                      -- what was heard
  reply text,                              -- what was answered
  tools jsonb not null default '[]'::jsonb, -- [{name, ok, text}]
  model text,
  input_tokens int,
  output_tokens int,
  ms int,
  error text
);
create index intercom_log_at on public.intercom_log (at desc);
alter table public.intercom_log enable row level security;
create policy family_read on public.intercom_log for select to authenticated using ((select private.is_family()));
revoke all on public.intercom_log from anon, authenticated;
grant select on public.intercom_log to authenticated;
