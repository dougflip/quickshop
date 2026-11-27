-- Access and complete_trip checks against a real database. Everything runs in one transaction
-- that is rolled back, so it is safe to run against the live project. Fixture users are created
-- inside the transaction and never persist.
--
-- Run it with the Supabase MCP `execute_sql` tool or `psql`. It always ends in an error that
-- reports "ACCESS CHECKS: n of n passed" followed by each check; every `ok` must be true.

begin;

create temp table checks (name text primary key, ok boolean not null);
grant all on checks to authenticated, anon;

-- Switch who is asking, the way PostgREST does for a signed-in request.
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act_as(uuid) to authenticated;

-- ---- Fixtures (as the database owner, bypassing RLS) ----
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('a0000000-0000-0000-0000-00000000d0c0', 'contract-doug@example.com', '{"display_name":"Doug"}', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000a1e00', 'contract-alex@example.com', '{"display_name":"Alex"}', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000011e0', 'contract-olive@example.com', '{}', 'authenticated', 'authenticated');

insert into public.households (id, name) values
  ('b0000000-0000-0000-0000-000000000001', 'Home'),
  ('b0000000-0000-0000-0000-000000000002', 'Elsewhere');
insert into public.household_members (household_id, user_id) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000d0c0'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000a1e00'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000011e0');
insert into public.categories (id, household_id, name, position) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Produce', 0),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Dairy', 1),
  ('c0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000002', 'Theirs', 0);
insert into public.items (id, household_id, name) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Milk'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Bananas');
insert into public.list_entries (id, household_id, item_id, status, added_by, updated_at) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'needed', 'a0000000-0000-0000-0000-00000000d0c0', now());

insert into checks values
  ('profiles are created on sign-up, with metadata or email name',
   (select array_agg(display_name order by display_name collate "C") from public.profiles
     where user_id in ('a0000000-0000-0000-0000-00000000d0c0', 'a0000000-0000-0000-0000-0000000a1e00', 'a0000000-0000-0000-0000-0000000011e0'))
   = array['Alex', 'Doug', 'contract-olive']);

-- ---- Doug, a member of Home ----
set local role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-00000000d0c0');

insert into checks values
  ('member sees only their household', (select array_agg(name) from public.households) = array['Home']),
  ('member sees housemates, not strangers',
   (select array_agg(display_name order by display_name) from public.profiles) = array['Alex', 'Doug']),
  ('member sees their categories only', (select count(*) from public.categories) = 2),
  ('member sees the list', (select count(*) from public.list_entries) = 1);

do $$ begin
  insert into public.list_entries (id, household_id, item_id, status, added_by, updated_at) values
    ('e0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001',
     'd0000000-0000-0000-0000-000000000002', 'needed', 'a0000000-0000-0000-0000-0000000a1e00', now());
  insert into checks values ('entries cannot be added in someone else''s name', false);
exception when insufficient_privilege then
  insert into checks values ('entries cannot be added in someone else''s name', true);
end $$;

do $$ begin
  insert into public.items (id, household_id, name)
    values ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'MILK');
  insert into checks values ('item names are unique ignoring case', false);
exception when unique_violation then
  insert into checks values ('item names are unique ignoring case', true);
end $$;

do $$ begin
  insert into public.item_categories (item_id, category_id, household_id, position)
    values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001', 0);
  insert into checks values ('items cannot use another household''s category', false);
exception when foreign_key_violation or insufficient_privilege then
  insert into checks values ('items cannot use another household''s category', true);
end $$;

-- Start a trip, check Milk, and have Bananas added mid-trip.
insert into public.shopping_trips (id, household_id, started_by, started_at)
  values ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000d0c0', now());
update public.list_entries set status = 'in_cart', updated_at = now()
  where id = 'e0000000-0000-0000-0000-000000000001';
insert into public.list_entries (id, household_id, item_id, status, added_by, updated_at) values
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000002', 'needed', 'a0000000-0000-0000-0000-00000000d0c0', now());

do $$ begin
  insert into public.shopping_trips (id, household_id, started_by, started_at)
    values ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000d0c0', now());
  insert into checks values ('only one trip in progress per household', false);
exception when unique_violation then
  insert into checks values ('only one trip in progress per household', true);
end $$;

-- A complete_trip that fails part-way (bad outcome) must change nothing.
do $$ begin
  perform public.complete_trip('f0000000-0000-0000-0000-000000000001', now(),
    array['e0000000-0000-0000-0000-000000000001']::uuid[],
    '[{"itemId":"d0000000-0000-0000-0000-000000000001","name":"Milk","note":null,"outcome":"bought"},
      {"itemId":null,"name":"Broken","note":null,"outcome":"stolen"}]');
  insert into checks values ('complete_trip is all or nothing', false);
exception when check_violation then
  insert into checks values ('complete_trip is all or nothing',
    (select count(*) from public.list_entries) = 2
    and (select completed_at is null from public.shopping_trips where id = 'f0000000-0000-0000-0000-000000000001')
    and (select count(*) from public.trip_items) = 0);
end $$;

-- ---- Olive, not a member of Home ----
select pg_temp.act_as('a0000000-0000-0000-0000-0000000011e0');

insert into checks values
  ('non-member sees nothing of another household',
   (select count(*) from public.items) = 0 and (select count(*) from public.list_entries) = 0
   and (select count(*) from public.shopping_trips) = 0
   and (select array_agg(name) from public.households) = array['Elsewhere']),
  ('non-member cannot complete another household''s trip',
   public.complete_trip('f0000000-0000-0000-0000-000000000001', now(), array[]::uuid[], '[]') = 'ignored');

do $$ begin
  insert into public.items (id, household_id, name)
    values ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Sneaky');
  insert into checks values ('non-member cannot write to another household', false);
exception when insufficient_privilege then
  insert into checks values ('non-member cannot write to another household', true);
end $$;

-- ---- Doug again: complete the trip ----
select pg_temp.act_as('a0000000-0000-0000-0000-00000000d0c0');

insert into checks values
  ('complete_trip applies once',
   public.complete_trip('f0000000-0000-0000-0000-000000000001', now(),
     array['e0000000-0000-0000-0000-000000000001']::uuid[],
     '[{"itemId":"d0000000-0000-0000-0000-000000000001","name":"Milk","note":null,"outcome":"bought"}]') = 'applied');
insert into checks values
  ('complete_trip clears only bought entries and keeps mid-trip additions',
   (select array_agg(item_id) from public.list_entries) = array['d0000000-0000-0000-0000-000000000002'::uuid]),
  ('complete_trip closes the trip and records its items',
   (select completed_at is not null from public.shopping_trips where id = 'f0000000-0000-0000-0000-000000000001')
   and (select count(*) from public.trip_items where outcome = 'bought') = 1),
  ('replaying complete_trip is ignored',
   public.complete_trip('f0000000-0000-0000-0000-000000000001', now(), array[]::uuid[], '[]') = 'ignored');

-- ---- Not signed in ----
reset role;
set local role anon;
do $$ begin
  perform count(*) from public.items;
  insert into checks values ('signed-out requests are refused', false);
exception when insufficient_privilege then
  insert into checks values ('signed-out requests are refused', true);
end $$;

reset role;
-- Report by raising: the error carries the results and aborts the transaction, so nothing above
-- can ever be committed, whichever way the script is run.
do $$ begin
  raise exception 'ACCESS CHECKS: % of % passed. %',
    (select count(*) from checks where ok), (select count(*) from checks),
    (select json_agg(json_build_object('ok', ok, 'check', name) order by ok, name) from checks);
end $$;
rollback;
