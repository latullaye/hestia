-- Hestia · 03 · Meals (never sent to Google Calendar) and shopping lists.

-- ---------- Dishes the family cooks ----------
create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null default '',
  tags text[] not null default '{}',
  ingredients text,                 -- Markdown list
  recipe text,                      -- Markdown
  source_url text,
  note text,
  favorite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
create or replace function private.set_name_key() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.name_key := private.norm(new.name);
  return new;
end $$;
create trigger a_name_key before insert or update on public.dishes
  for each row execute function private.set_name_key();
select private.setup_synced_table('dishes', 'name');

-- ---------- Who eats what, when ----------
create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  member_ids uuid[] not null default '{}',  -- who eats it; empty: everybody
  dish_id uuid references public.dishes (id) on delete set null,
  label text,                               -- free text: a one-off dish, the restaurant's name… (wins over the dish's name)
  kind text not null default 'home' check (kind in ('home', 'leftovers', 'restaurant', 'takeout', 'other')),
  cook_ids uuid[] not null default '{}',    -- who cooks (several: together)
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
create index meal_plan_date on public.meal_plan (date);
select private.setup_synced_table('meal_plan', 'label');

-- ---------- Shopping ----------
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  sort_order int not null default 0,
  show_on_kiosk boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
select private.setup_synced_table('shopping_lists', 'name');

-- Aisles of a store, in the order one walks through it
create table public.shopping_sections (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  name text not null,
  emoji text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
select private.setup_synced_table('shopping_sections', 'name');

-- An item stays in its list for ever: "needed" says whether it is to buy now. Checking it off in the store sets
-- needed = false and purchased_at = now: the activity log then says who bought what and when.
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  section_id uuid references public.shopping_sections (id) on delete set null,
  name text not null,
  name_key text not null default '',
  note text,                                -- quantity, brand, "si en spécial"…
  needed boolean not null default true,
  needed_at timestamptz,
  purchased_at timestamptz,
  purchase_count int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id) on delete set null,
  updated_via text not null default 'app',
  deleted_at timestamptz
);
create index shopping_items_list on public.shopping_items (list_id, needed);
create index shopping_items_key on public.shopping_items (name_key);

create or replace function private.shopping_item_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.name_key := private.norm(new.name);
  if tg_op = 'INSERT' then
    if new.needed then new.needed_at := coalesce(new.needed_at, now()); end if;
    return new;
  end if;
  if new.needed and not old.needed then new.needed_at := now(); end if;
  if not new.needed and old.needed and new.purchased_at is distinct from old.purchased_at then
    new.purchase_count := old.purchase_count + 1;
  else
    new.purchase_count := old.purchase_count;
  end if;
  return new;
end $$;
create trigger a_shopping_item_before before insert or update on public.shopping_items
  for each row execute function private.shopping_item_before();
select private.setup_synced_table('shopping_items', 'name');

-- Every purchase, ready for statistics ("how often do we buy eggs?")
create view public.purchases with (security_invoker = true) as
select l.id as log_id, l.at, l.actor_id, m.name as actor, l.via, i.id as item_id, i.name as item, i.name_key,
       s.name as list, sec.name as section
from public.activity_log l
join public.shopping_items i on i.id::text = l.entity_id
join public.shopping_lists s on s.id = i.list_id
left join public.shopping_sections sec on sec.id = i.section_id
left join public.members m on m.id = l.actor_id
where l.entity_type = 'shopping_items' and l.action = 'purchased';
revoke all on public.purchases from anon;
grant select on public.purchases to authenticated;

-- The usual lists, with their aisles (their items are family data: not in this file)
do $$
declare
  l uuid;
begin
  insert into public.shopping_lists (name, emoji, sort_order, updated_via) values ('Épicerie', '🛒', 1, 'system') returning id into l;
  insert into public.shopping_sections (list_id, name, emoji, sort_order, updated_via) values
    (l, 'Fruits & légumes', '🥬', 1, 'system'), (l, 'Boulangerie', '🫓', 2, 'system'), (l, 'Viandes & poissons', '🥩', 3, 'system'),
    (l, 'Produits laitiers & œufs', '🧀', 4, 'system'), (l, 'Garde-manger', '🍚', 5, 'system'), (l, 'Condiments', '🫙', 6, 'system'),
    (l, 'Boissons', '🥤', 7, 'system'), (l, 'Produits congelés', '🧊', 8, 'system'), (l, 'Ménage & hygiène', '🧹', 9, 'system'),
    (l, 'Bébé', '👶', 10, 'system'), (l, 'Autre', '📦', 99, 'system');
  insert into public.shopping_lists (name, emoji, sort_order, updated_via) values ('Costco', '🏬', 2, 'system') returning id into l;
  insert into public.shopping_sections (list_id, name, emoji, sort_order, updated_via) values
    (l, 'Bébé', '👶', 1, 'system'), (l, 'Ménage & hygiène', '🧹', 2, 'system'), (l, 'Garde-manger', '🥜', 3, 'system'),
    (l, 'Boulangerie', '🫓', 4, 'system'), (l, 'Viandes & poissons', '🥩', 5, 'system'), (l, 'Fruits & légumes', '🥔', 6, 'system'),
    (l, 'Produits laitiers & œufs', '🥛', 7, 'system'), (l, 'Desserts', '🍮', 8, 'system'), (l, 'Boissons', '🥤', 9, 'system'),
    (l, 'Produits congelés', '🧊', 10, 'system'), (l, 'Autre', '📦', 99, 'system');
  insert into public.shopping_lists (name, emoji, sort_order, show_on_kiosk, updated_via) values
    ('Pharmacie', '💊', 3, true, 'system'), ('Quincaillerie', '🔧', 4, true, 'system'), ('Autre', '🧾', 5, true, 'system');
end $$;
