-- M7: what the app calls. One function reads a household, one applies any change, and committed
-- changes are broadcast to a private channel per household.
--
-- The rules in apply_mutation mirror core's `applyMutation` (packages/core/src/domain/mutation.ts).
-- The backend contract suite runs against both, which is what keeps them in step.
-- JSON goes in and out in exactly the shapes core uses: camelCase keys, times as epoch milliseconds.

-- ---------------------------------------------------------------------------------------------
-- Times and text

create function private.instant(ts timestamptz)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (extract(epoch from ts) * 1000)::bigint;
$$;

create function private.from_instant(ms bigint)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select timestamptz 'epoch' + ms * interval '1 millisecond';
$$;

-- Same as core's normalizeName: trimmed, inner whitespace collapsed to one space.
create function private.normalize_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'));
$$;

-- Same as core's cleanNote: trimmed, and a blank note is no note.
create function private.clean_note(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(raw, ''), '^\s+|\s+$', '', 'g'), '');
$$;

-- ---------------------------------------------------------------------------------------------
-- Rows as core's JSON shapes

create function private.item_json(i public.items)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'name', i.name,
    'categoryIds', coalesce(
      (select jsonb_agg(ic.category_id order by ic.position)
       from public.item_categories ic where ic.item_id = i.id),
      '[]'::jsonb));
$$;

create function private.entry_json(e public.list_entries)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'itemId', e.item_id,
    'note', e.note,
    'status', e.status,
    'addedBy', e.added_by,
    'updatedAt', private.instant(e.updated_at));
$$;

create function private.trip_json(t public.shopping_trips)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'startedBy', t.started_by, 'startedAt', private.instant(t.started_at));
$$;

create function private.shop_json(household uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('kind', 'shopping', 'trip', private.trip_json(t))
     from public.shopping_trips t
     where t.household_id = household and t.completed_at is null),
    '{"kind": "planning"}'::jsonb);
$$;

-- ---------------------------------------------------------------------------------------------
-- Reading

-- The signed-in user's households, earliest membership first.
create function public.my_households()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by m.created_at, h.id),
    '[]'::jsonb)
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = (select auth.uid());
$$;

-- Everything one household's screens need, read in one consistent snapshot.
-- Null when the household doesn't exist or the caller isn't a member.
create function public.load_household(household uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'household', jsonb_build_object('id', h.id, 'name', h.name),
    'members', coalesce(
      (select jsonb_agg(
         jsonb_build_object('userId', m.user_id, 'displayName', p.display_name)
         order by m.created_at, m.user_id)
       from public.household_members m
       join public.profiles p on p.user_id = m.user_id
       where m.household_id = h.id),
      '[]'::jsonb),
    'data', jsonb_build_object(
      'categories', coalesce(
        (select jsonb_agg(
           jsonb_build_object('id', c.id, 'name', c.name, 'position', c.position)
           order by c.position, c.name)
         from public.categories c where c.household_id = h.id),
        '[]'::jsonb),
      'items', coalesce(
        (select jsonb_agg(private.item_json(i) order by i.name)
         from public.items i where i.household_id = h.id),
        '[]'::jsonb),
      'entries', coalesce(
        (select jsonb_agg(private.entry_json(e) order by e.created_at, e.id)
         from public.list_entries e where e.household_id = h.id),
        '[]'::jsonb),
      'shop', private.shop_json(h.id)))
  from public.households h
  where h.id = load_household.household;
$$;

-- ---------------------------------------------------------------------------------------------
-- Writing

-- The first category id that isn't one of the household's, or null if they all are.
create function private.unknown_category(household uuid, category_ids uuid[])
returns uuid
language sql
stable
set search_path = ''
as $$
  select c.id
  from unnest(category_ids) with ordinality as c (id, n)
  where not exists (
    select 1 from public.categories k where k.id = c.id and k.household_id = household)
  order by c.n
  limit 1;
$$;

-- Replaces an item's categories, keeping their order and dropping repeats.
create function private.save_item_categories(household uuid, target uuid, category_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  delete from public.item_categories ic where ic.item_id = target;
  insert into public.item_categories (item_id, category_id, household_id, position)
  select target, c.id, household, (row_number() over (order by c.n) - 1)::integer
  from (
    select u.id, min(u.n) as n
    from unnest(category_ids) with ordinality as u (id, n)
    group by u.id
  ) c;
$$;

create function private.uuids(list jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(list)::uuid), '{}');
$$;

-- Applies one change from the app: one of core's `Mutation`s, as JSON. Returns
--   {"kind": "applied"} or {"kind": "ignored"} (already applied, stale, or its target is gone),
--   {"kind": "rejected", "reason": <core DomainError>} for a real conflict,
--   {"kind": "unauthorized"} when the caller isn't a member of the household.
-- Runs with the caller's rights, so the access rules still apply underneath.
create function public.apply_mutation(household uuid, mutation jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_name text;
  v_existing uuid;
  v_categories uuid[];
  v_missing uuid;
  v_at timestamptz;
  v_trip public.shopping_trips;
  applied constant jsonb := '{"kind": "applied"}';
  ignored constant jsonb := '{"kind": "ignored"}';
begin
  if v_actor is null or not private.is_member(household) then
    return '{"kind": "unauthorized"}';
  end if;
  -- One change at a time per household, so each check below still holds when the write lands.
  perform pg_advisory_xact_lock(hashtextextended('quickshop:' || household::text, 0));

  case mutation ->> 'kind'

  when 'createItem' then
    v_id := (mutation #>> '{item,id}')::uuid;
    if exists (select 1 from public.items i where i.id = v_id) then return ignored; end if;
    v_name := private.normalize_name(mutation #>> '{item,name}');
    if v_name = '' then
      return jsonb_build_object('kind', 'rejected', 'reason', jsonb_build_object('kind', 'emptyName'));
    end if;
    select i.id into v_existing from public.items i
    where i.household_id = household and lower(i.name) = lower(v_name);
    if found then
      return jsonb_build_object('kind', 'rejected', 'reason',
        jsonb_build_object('kind', 'duplicateItemName', 'existingItemId', v_existing));
    end if;
    v_categories := private.uuids(mutation #> '{item,categoryIds}');
    v_missing := private.unknown_category(household, v_categories);
    if v_missing is not null then
      return jsonb_build_object('kind', 'rejected', 'reason',
        jsonb_build_object('kind', 'categoryNotFound', 'categoryId', v_missing));
    end if;
    insert into public.items (id, household_id, name) values (v_id, household, v_name);
    perform private.save_item_categories(household, v_id, v_categories);
    return applied;

  when 'renameItem' then
    v_id := (mutation ->> 'itemId')::uuid;
    if not exists (select 1 from public.items i where i.id = v_id and i.household_id = household) then
      return ignored;
    end if;
    v_name := private.normalize_name(mutation ->> 'name');
    if v_name = '' then
      return jsonb_build_object('kind', 'rejected', 'reason', jsonb_build_object('kind', 'emptyName'));
    end if;
    select i.id into v_existing from public.items i
    where i.household_id = household and lower(i.name) = lower(v_name) and i.id <> v_id;
    if found then
      return jsonb_build_object('kind', 'rejected', 'reason',
        jsonb_build_object('kind', 'duplicateItemName', 'existingItemId', v_existing));
    end if;
    update public.items i set name = v_name, updated_at = now() where i.id = v_id;
    return applied;

  when 'setItemCategories' then
    v_id := (mutation ->> 'itemId')::uuid;
    if not exists (select 1 from public.items i where i.id = v_id and i.household_id = household) then
      return ignored;
    end if;
    v_categories := private.uuids(mutation -> 'categoryIds');
    v_missing := private.unknown_category(household, v_categories);
    if v_missing is not null then
      return jsonb_build_object('kind', 'rejected', 'reason',
        jsonb_build_object('kind', 'categoryNotFound', 'categoryId', v_missing));
    end if;
    perform private.save_item_categories(household, v_id, v_categories);
    update public.items i set updated_at = now() where i.id = v_id;
    return applied;

  when 'deleteItem' then
    -- The item's list entry and category links go with it (foreign keys cascade).
    delete from public.items i
    where i.id = (mutation ->> 'itemId')::uuid and i.household_id = household;
    return case when found then applied else ignored end;

  when 'addEntry' then
    v_id := (mutation #>> '{entry,id}')::uuid;
    if exists (select 1 from public.list_entries e where e.id = v_id) then return ignored; end if;
    if not exists (
      select 1 from public.items i
      where i.id = (mutation #>> '{entry,itemId}')::uuid and i.household_id = household
    ) then
      return ignored;
    end if;
    select e.id into v_existing from public.list_entries e
    where e.item_id = (mutation #>> '{entry,itemId}')::uuid;
    if found then
      return jsonb_build_object('kind', 'rejected', 'reason',
        jsonb_build_object('kind', 'alreadyOnList', 'entryId', v_existing));
    end if;
    -- Whatever the mutation says, the entry starts as needed and is added by the caller.
    insert into public.list_entries (id, household_id, item_id, note, status, added_by, updated_at)
    values (
      v_id,
      household,
      (mutation #>> '{entry,itemId}')::uuid,
      private.clean_note(mutation #>> '{entry,note}'),
      'needed',
      v_actor,
      private.from_instant((mutation #>> '{entry,updatedAt}')::bigint));
    return applied;

  when 'removeEntry' then
    delete from public.list_entries e
    where e.id = (mutation ->> 'entryId')::uuid and e.household_id = household;
    return case when found then applied else ignored end;

  when 'setNote' then
    update public.list_entries e
    set note = private.clean_note(mutation ->> 'note'),
        updated_at = private.from_instant((mutation ->> 'at')::bigint)
    where e.id = (mutation ->> 'entryId')::uuid and e.household_id = household;
    return case when found then applied else ignored end;

  when 'startTrip' then
    v_id := (mutation #>> '{trip,id}')::uuid;
    -- Already started, or started and finished: a replay either way.
    if exists (select 1 from public.shopping_trips t where t.id = v_id) then return ignored; end if;
    select * into v_trip from public.shopping_trips t
    where t.household_id = household and t.completed_at is null;
    if found then
      return jsonb_build_object('kind', 'rejected', 'reason',
        jsonb_build_object('kind', 'tripAlreadyInProgress', 'trip', private.trip_json(v_trip)));
    end if;
    insert into public.shopping_trips (id, household_id, started_by, started_at)
    values (v_id, household, v_actor,
      private.from_instant((mutation #>> '{trip,startedAt}')::bigint));
    return applied;

  when 'setEntryStatus' then
    if not exists (
      select 1 from public.shopping_trips t
      where t.household_id = household and t.completed_at is null
    ) then
      return ignored;
    end if;
    v_at := private.from_instant((mutation ->> 'at')::bigint);
    -- The newest change wins: anything older than the entry's last change is ignored.
    update public.list_entries e
    set status = mutation ->> 'status', updated_at = v_at
    where e.id = (mutation ->> 'entryId')::uuid and e.household_id = household
      and e.updated_at <= v_at;
    return case when found then applied else ignored end;

  when 'completeTrip' then
    v_id := (mutation ->> 'tripId')::uuid;
    if not exists (
      select 1 from public.shopping_trips t where t.id = v_id and t.household_id = household
    ) then
      return ignored;
    end if;
    return jsonb_build_object('kind', public.complete_trip(
      v_id,
      private.from_instant((mutation ->> 'completedAt')::bigint),
      private.uuids(mutation -> 'boughtEntryIds'),
      mutation -> 'items'));

  else
    raise exception 'unknown mutation kind: %', mutation ->> 'kind' using errcode = '22023';
  end case;
end;
$$;

revoke execute on function public.my_households() from public, anon;
revoke execute on function public.load_household(uuid) from public, anon;
revoke execute on function public.apply_mutation(uuid, jsonb) from public, anon;
grant execute on function public.my_households() to authenticated;
grant execute on function public.load_household(uuid) to authenticated;
grant execute on function public.apply_mutation(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Live updates: Broadcast to a private channel per household, "household:<id>"
--
-- Postgres Changes can't keep deletes private (they reach every subscriber, whatever the access
-- rules say), so committed changes are broadcast from triggers instead, as core `Change`s.
-- Only members can join a household's channel.

alter publication supabase_realtime
  drop table public.items, public.item_categories, public.list_entries, public.shopping_trips;

create function private.broadcast(household uuid, change jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send(change, change ->> 'kind', 'household:' || household::text, true);
$$;

-- Entries go out as they change.
create function private.broadcast_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.broadcast(old.household_id,
      jsonb_build_object('kind', 'entryDeleted', 'entryId', old.id));
  else
    perform private.broadcast(new.household_id,
      jsonb_build_object('kind', 'entrySaved', 'entry', private.entry_json(new)));
  end if;
  return null;
end;
$$;

create trigger broadcast_entry
after insert or update or delete on public.list_entries
for each row execute function private.broadcast_entry();

create function private.broadcast_item_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(old.household_id,
    jsonb_build_object('kind', 'itemDeleted', 'itemId', old.id));
  return null;
end;
$$;

create trigger broadcast_item_deleted
after delete on public.items
for each row execute function private.broadcast_item_deleted();

-- An item and its categories are one `Item`, so these wait until commit and send the item as it
-- ended up. Nothing is sent if the item was deleted by then.
create function private.broadcast_item(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items;
begin
  select * into v_item from public.items i where i.id = target;
  if found then
    perform private.broadcast(v_item.household_id,
      jsonb_build_object('kind', 'itemSaved', 'item', private.item_json(v_item)));
  end if;
end;
$$;

create function private.broadcast_item_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast_item(new.id);
  return null;
end;
$$;

create function private.broadcast_item_categories_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.broadcast_item(old.item_id);
  else
    perform private.broadcast_item(new.item_id);
  end if;
  return null;
end;
$$;

create constraint trigger broadcast_item_saved
after insert or update on public.items
deferrable initially deferred
for each row execute function private.broadcast_item_saved();

create constraint trigger broadcast_item_categories_changed
after insert or update or delete on public.item_categories
deferrable initially deferred
for each row execute function private.broadcast_item_categories_changed();

-- Trips: the household's shop state as of commit.
create function private.broadcast_shop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast(new.household_id,
    jsonb_build_object('kind', 'shopChanged', 'shop', private.shop_json(new.household_id)));
  return null;
end;
$$;

create constraint trigger broadcast_shop
after insert or update on public.shopping_trips
deferrable initially deferred
for each row execute function private.broadcast_shop();

-- Trigger functions are only for triggers.
revoke execute on function private.broadcast(uuid, jsonb) from public;
revoke execute on function private.broadcast_item(uuid) from public;
revoke execute on function private.broadcast_entry() from public;
revoke execute on function private.broadcast_item_deleted() from public;
revoke execute on function private.broadcast_item_saved() from public;
revoke execute on function private.broadcast_item_categories_changed() from public;
revoke execute on function private.broadcast_shop() from public;

-- Members may join their household's channel. Nobody may send on it from the app.
create policy "household members receive their household's changes" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.household_members m
      where m.user_id = (select auth.uid())
        and realtime.topic() = 'household:' || m.household_id::text
    )
  );
