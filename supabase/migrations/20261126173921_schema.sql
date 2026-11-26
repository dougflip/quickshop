-- QuickShop v2 schema. See docs/data-model.md.
--
-- Access model: every household-owned row carries household_id, and one check decides access:
-- is the signed-in user a member of that household? Only the `authenticated` role gets grants;
-- `anon` gets nothing. RLS is enabled on every table.
--
-- Ids are UUIDs generated on the client, so changes made offline already have their final ids.

-- ---------------------------------------------------------------------------------------------
-- Housekeeping

-- Created by the project's "Enable RLS on new tables automatically" setting. It is an event
-- trigger function, so it cannot do anything when called directly, but nobody needs to call it.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Helpers that bypass RLS live here, outside the schemas the API exposes.
create schema private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------------------------
-- People and households

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (display_name = btrim(display_name) and display_name <> '')
);

create table public.households (
  id uuid primary key,
  name text not null check (name = btrim(name) and name <> ''),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The app opens the user's earliest household.
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_id_idx on public.household_members (user_id);

-- Every new account gets a profile. The display name comes from sign-up metadata, falling back
-- to the part of the email before the @.
create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger create_profile_after_signup
after insert on auth.users
for each row execute function private.create_profile_for_new_user();

-- ---------------------------------------------------------------------------------------------
-- Catalog

create table public.categories (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (name = btrim(name) and name <> ''),
  -- Lower comes first on the list and shopping screens.
  position integer not null,
  unique (household_id, name),
  unique (id, household_id)
);

create table public.items (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  -- The app normalizes names (trimmed, single spaces) before saving.
  name text not null check (name = btrim(name) and name <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);
-- "Milk" and "milk" cannot both exist in one household.
create unique index items_household_name_idx on public.items (household_id, lower(name));

create table public.item_categories (
  item_id uuid not null,
  category_id uuid not null,
  household_id uuid not null,
  -- 0 is the primary category, the one the list groups the item under.
  position integer not null,
  primary key (item_id, category_id),
  -- The composite keys stop an item being linked to another household's category.
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade,
  foreign key (category_id, household_id) references public.categories (id, household_id) on delete cascade
);
create index item_categories_household_id_idx on public.item_categories (household_id);
create index item_categories_category_id_idx on public.item_categories (category_id);

-- ---------------------------------------------------------------------------------------------
-- The list and shopping trips

create table public.list_entries (
  id uuid primary key,
  household_id uuid not null,
  -- An item is on the list at most once.
  item_id uuid not null unique,
  note text check (note is null or (note = btrim(note) and note <> '')),
  status text not null check (status in ('needed', 'in_cart')),
  added_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  -- Set by the client. When offline changes sync, the newest one wins.
  updated_at timestamptz not null,
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade
);
create index list_entries_household_id_idx on public.list_entries (household_id);

create table public.shopping_trips (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  started_by uuid not null references auth.users (id),
  started_at timestamptz not null,
  -- Null while the trip is in progress.
  completed_at timestamptz,
  unique (id, household_id),
  check (completed_at is null or completed_at >= started_at)
);
-- At most one trip in progress per household.
create unique index shopping_trips_one_in_progress_idx
  on public.shopping_trips (household_id) where completed_at is null;

-- A copy of each entry when the trip completed, so history reads correctly after renames or deletes.
create table public.trip_items (
  trip_id uuid not null,
  household_id uuid not null,
  position integer not null,
  item_id uuid references public.items (id) on delete set null,
  name text not null,
  note text,
  outcome text not null check (outcome in ('bought', 'left')),
  primary key (trip_id, position),
  foreign key (trip_id, household_id) references public.shopping_trips (id, household_id) on delete cascade
);
create index trip_items_household_id_idx on public.trip_items (household_id);
create index trip_items_item_id_idx on public.trip_items (item_id);

-- ---------------------------------------------------------------------------------------------
-- Access rules

create function private.is_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target_household and m.user_id = (select auth.uid())
  );
$$;

create function private.shares_household(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user
  );
$$;

revoke execute on function private.is_member(uuid) from public;
revoke execute on function private.shares_household(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.shares_household(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_categories enable row level security;
alter table public.list_entries enable row level security;
alter table public.shopping_trips enable row level security;
alter table public.trip_items enable row level security;

-- People see their own profile and the profiles of people they share a household with.
create policy "profiles: self and housemates" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.shares_household(user_id)));

create policy "households: members read" on public.households
  for select to authenticated
  using ((select private.is_member(id)));

create policy "household_members: members read" on public.household_members
  for select to authenticated
  using ((select private.is_member(household_id)));

-- Households, memberships and categories are set up by hand for now, so members only read them.
create policy "categories: members read" on public.categories
  for select to authenticated
  using ((select private.is_member(household_id)));

create policy "items: members read and write" on public.items
  for all to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));

create policy "item_categories: members read and write" on public.item_categories
  for all to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));

-- Entries are always recorded as added by the person adding them.
create policy "list_entries: members read" on public.list_entries
  for select to authenticated
  using ((select private.is_member(household_id)));
create policy "list_entries: members add as themselves" on public.list_entries
  for insert to authenticated
  with check ((select private.is_member(household_id)) and added_by = (select auth.uid()));
create policy "list_entries: members update" on public.list_entries
  for update to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));
create policy "list_entries: members delete" on public.list_entries
  for delete to authenticated
  using ((select private.is_member(household_id)));

-- Trips are always recorded as started by the person starting them.
create policy "shopping_trips: members read" on public.shopping_trips
  for select to authenticated
  using ((select private.is_member(household_id)));
create policy "shopping_trips: members start as themselves" on public.shopping_trips
  for insert to authenticated
  with check ((select private.is_member(household_id)) and started_by = (select auth.uid()));
create policy "shopping_trips: members complete" on public.shopping_trips
  for update to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));

create policy "trip_items: members read and record" on public.trip_items
  for all to authenticated
  using ((select private.is_member(household_id)))
  with check ((select private.is_member(household_id)));

-- Grants: signed-in users only. Anything not granted here is refused before RLS is consulted.
grant select on public.profiles, public.households, public.household_members, public.categories
  to authenticated;
grant select, insert, update, delete on public.items, public.item_categories, public.list_entries
  to authenticated;
grant select, insert, update on public.shopping_trips to authenticated;
grant select, insert on public.trip_items to authenticated;

-- The service role (server-side scripts: seeding, test setup) bypasses RLS but still needs grants.
grant all on all tables in schema public to service_role;
revoke execute on function private.create_profile_for_new_user() from public;

-- ---------------------------------------------------------------------------------------------
-- Completing a trip, all or nothing

-- Records the trip's items, clears only the entries that were bought (anything added during the
-- trip survives), puts any other in-cart entries back to needed, and closes the trip.
-- Returns 'applied', or 'ignored' if the trip is unknown or already complete, so replaying the
-- same call from an offline queue is harmless. Runs with the caller's rights, so RLS applies.
create function public.complete_trip(
  trip_id uuid,
  completed_at timestamptz,
  bought_entry_ids uuid[],
  items jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  trip public.shopping_trips;
begin
  select * into trip from public.shopping_trips t where t.id = complete_trip.trip_id for update;
  if not found or trip.completed_at is not null then
    return 'ignored';
  end if;

  insert into public.trip_items (trip_id, household_id, position, item_id, name, note, outcome)
  select
    trip.id,
    trip.household_id,
    (entry.ordinality - 1)::integer,
    (select i.id from public.items i where i.id = (entry.value ->> 'itemId')::uuid),
    entry.value ->> 'name',
    entry.value ->> 'note',
    entry.value ->> 'outcome'
  from jsonb_array_elements(complete_trip.items) with ordinality as entry (value, ordinality);

  delete from public.list_entries e
  where e.household_id = trip.household_id and e.id = any (complete_trip.bought_entry_ids);

  update public.list_entries e
  set status = 'needed'
  where e.household_id = trip.household_id and e.status = 'in_cart';

  update public.shopping_trips t
  set completed_at = complete_trip.completed_at
  where t.id = trip.id;

  return 'applied';
end;
$$;

revoke execute on function public.complete_trip(uuid, timestamptz, uuid[], jsonb) from public, anon;
grant execute on function public.complete_trip(uuid, timestamptz, uuid[], jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Live updates: the tables the app subscribes to, filtered by household_id.

alter publication supabase_realtime
  add table public.items, public.item_categories, public.list_entries, public.shopping_trips;
