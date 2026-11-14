-- Hestia · Dishes say what they are served as and where their recipe comes from.

alter table public.dishes
  add column courses text[] not null default '{}',  -- starter | main | side | dessert | breakfast | drink (several allowed)
  add column source text;                           -- where the recipe comes from (a person, a book); source_url holds the link
alter table public.dishes
  add constraint dishes_courses_known check (courses <@ array['starter', 'main', 'side', 'dessert', 'breakfast', 'drink']);
