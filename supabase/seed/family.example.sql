-- Hestia · family data (example). Copy to family.private.sql (ignored by git), put your own values, and run it once in the
-- Supabase SQL editor (Dashboard › SQL Editor) after the migrations. Nothing personal is ever committed: see docs/SETUP.md.
-- It can be run again: every statement skips what already exists.

-- 1. Members. Create the accounts first (Dashboard › Authentication › Users › Add user, "Auto confirm user"),
--    one per adult and one for the kitchen tablet; the emails below link each account to its member.
insert into public.members (name, role, needs_caregiver, color, emoji, aliases, birth_date, sort_order, auth_user_id, updated_via)
select v.name, v.role, v.needs_caregiver, v.color, v.emoji, v.aliases, v.birth_date::date, v.sort_order,
       (select id from auth.users u where lower(u.email) = lower(v.email)), 'system'
from (values
  ('Parent 1', 'adult',  false, '#1f6f78', null, '{}'::text[],        null,         1, 'parent1@example.com'),
  ('Parent 2', 'adult',  false, '#c2603a', null, '{Surnom}'::text[],  null,         2, 'parent2@example.com'),
  ('Enfant',   'child',  true,  '#d39a1c', '🐣', '{}'::text[],        '2026-01-01', 3, null),
  ('Kiosque',  'device', false, '#5d706d', '📺', '{}'::text[],        null,         9, 'kiosque@example.com')
) as v (name, role, needs_caregiver, color, emoji, aliases, birth_date, sort_order, email)
where not exists (select 1 from public.members m where m.name = v.name);

-- An account created later: link it to its member
-- update public.members set auth_user_id = (select id from auth.users where lower(email) = lower('parent2@example.com')) where name = 'Parent 2';

-- 2. Birthdays (kind: birthday | anniversary | memorial)
insert into public.birthdays (name, month, day, year, kind, note, updated_via)
select v.* , 'system' from (values
  ('Mamie Jo', 3, 14, 1950, 'birthday', 'grand-mère'),
  ('Mariage',  9,  6, 2019, 'anniversary', null)
) as v (name, month, day, year, kind, note)
where not exists (select 1 from public.birthdays b where b.name = v.name and b.month = v.month and b.day = v.day);

-- 3. Dishes the family cooks
insert into public.dishes (name, favorite, updated_via)
select v.name, true, 'system' from (values ('Spaghetti carbonara'), ('Rouleaux de printemps')) as v (name)
where not exists (select 1 from public.dishes d where d.name = v.name);

-- 4. Shopping items (needed: to buy now), by list and aisle
insert into public.shopping_items (list_id, section_id, name, note, needed, updated_via)
select l.id, s.id, v.name, v.note, v.needed, 'system'
from (values
  ('Épicerie', 'Fruits & légumes', 'Bananes', null, true),
  ('Épicerie', 'Produits laitiers & œufs', 'Œufs', 'x12', false)
) as v (list, section, name, note, needed)
join public.shopping_lists l on l.name = v.list and l.deleted_at is null
left join public.shopping_sections s on s.list_id = l.id and s.name = v.section and s.deleted_at is null
where not exists (select 1 from public.shopping_items i where i.list_id = l.id and i.name = v.name);

-- 5. Recurring chores (schedule: see docs/DATA_MODEL.md)
insert into public.chores (title, emoji, assignee_ids, schedule, time_of_day, updated_via)
select v.title, v.emoji, array(select id from public.members where name = any (v.who)), v.schedule::jsonb, v.time_of_day, 'system'
from (values
  ('Vider la litière', '🐈', '{Parent 1}'::text[], '{"type": "daily"}', 'evening'),
  ('Sortir les poubelles', '🗑️', '{Parent 1}'::text[], '{"type": "weekly", "weekdays": [3]}', 'evening')
) as v (title, emoji, who, schedule, time_of_day)
where not exists (select 1 from public.chores c where c.title = v.title and c.deleted_at is null);
