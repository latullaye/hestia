-- Hestia · A Christmas present is either the big one (under the tree) or a small one for the stocking.
alter table public.gifts add column kind text check (kind in ('main', 'stocking')); -- null: not said (birthdays, ideas)
