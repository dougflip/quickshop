# Milestones

Each milestone is small and ends with something you can check. The core comes first and is proven to work without any UI (M1–M4). Supabase comes next (M6–M7), and the real UI is last (M8–M9).

See [planning.md](./planning.md) for decisions and [data-model.md](./data-model.md) for the schema.

M6 onwards use a hosted Supabase project, so nothing needs Docker.

## Target layout

```
packages/
  core/              plain TS: domain, ports, engine, offline queue. No React, no Supabase
  adapter-memory/    in-memory backend for tests and the harness. Several clients can share one
  adapter-supabase/  implements the ports with Supabase (database functions + Broadcast)
  scenarios/         headless end-to-end tests: real engines against the in-memory backend
  web/               React + Vite PWA. Starts as the harness (M5), becomes the real app (M8)
supabase/            migrations, access rules, complete_trip function, seed
docs/                overview, planning, data model, milestones, mockup
```

Dependency rule, checked by lint: `core` imports nothing from the other packages. Adapters import `core`. `web` imports `core`, and touches adapters only in one composition file (`web/src/main.tsx`), which picks the adapter.

---

## M0: Reset the repo and set up tooling ✅

- Delete v1 (`packages/*` and the built site in `docs/`). v1's 85 items and 17 departments are kept in [reference/v1-catalog.json](./reference/v1-catalog.json) as seed input for M6.
- Move `v2/*` into `docs/`.
- npm workspaces, TypeScript `strict` (plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), oxlint (type-aware) with `switch-exhaustiveness-check` and the import rule above, oxfmt, Vitest.
- One root `npm run check` that runs typecheck + lint + tests.
- GitHub Actions runs `check` on every push and PR.

**Done when:** a placeholder test passes and `check` is green locally and in CI.

## M1: Core domain (pure functions) ✅

- Branded ids, `EntryStatus`, `ShopState`, `ListEntry`, `Item`, `Category`, `Trip`.
- Pure functions, each taking state and returning new state or a typed error (a `Result` union, no exceptions):
  - Catalog: create/rename/delete item, set categories (keeping order), and reject duplicate names ignoring case.
  - List: add entry (the same item can't be added twice), remove, set note.
  - Grouping: entries grouped by primary category in category order, sorted by name inside each group, with "Other" last.
  - Trips: start (rejected if one is in progress), set entry status, complete (split into bought/left, keep the left ones).

**Done when:** unit tests cover every function, including the error cases.

## M2: Ports and in-memory adapter ✅

- Interfaces in `core/ports`:
  - `AuthPort`: sign in, sign out, current session.
  - `BackendPort`: list and load households, `apply(mutation)`, and `subscribe` to live changes. Every write is one `Mutation` union (`createItem | addEntry | startTrip | setEntryStatus | completeTrip | …`), the same shape the M4 offline queue stores and replays.
  - `LocalStore`, `NetworkStatus`, `Clock`, `IdGenerator`.
- Server rules every backend follows: the signed-in user is recorded as author; repeated, stale or orphaned mutations return `ignored`; real conflicts return `rejected` with the domain error.
- `adapter-memory`: one shared server that several connections can use, each with its own session and an online/offline switch. Changes are delivered asynchronously, like a real change feed.
- **Contract tests** in `@quickshop/core/contract`: one shared suite any backend must pass. M7 runs the same suite against Supabase.

**Done when:** the contract suite passes against the in-memory adapter.

## M3: Engine ✅

- `createEngine(deps)` returns the only object the UI uses: `getState()`, `subscribe()`, and commands (`addToList`, `toggleInCart`, `completeTrip`, …).
- State as a union: `starting | signedOut | loading | noHousehold | loadFailed | ready`. Signing in loads the first household.
- Commands are checked locally first: an invalid one returns a typed error and sends nothing. A valid one shows at once and is sent in order. The screen shows the server's data with this device's unconfirmed changes applied on top, so a change the server refuses simply drops out and becomes a `notice`.
- Live changes from the other person are merged in. Subscribing happens before loading, so nothing is missed in between.
- `applyMutation` moved into core so the device and every backend apply changes with the same rules.
- Scenario tests live in `packages/scenarios`, which may import both core and the in-memory adapter.

**Done when:** a headless scenario test, with two engines on one in-memory backend, has Doug add Milk and Alex's state show it, then has Alex start a trip and Doug's state show "Alex is shopping".

## M4: Offline queue ✅

- Shopping changes (`startTrip`, `setEntryStatus`, `completeTrip`) work offline. Everything else is refused with a typed `offline` error, after any local mistake is reported.
- The engine keeps a device copy (`LocalStore`): the household as last confirmed plus the queue of unsent changes. The app opens from it when offline, and the queue survives a reload.
- On reconnect the queue is sent in order, then the household reloads to pick up anything missed. A shopping change that fails mid-request (the phone thinks it is online but the server can't be reached) stays queued and is retried on the next change or reconnect. There is no retry timer yet.
- Ops set values, the newest `at` wins, and ops for rows that no longer exist are ignored, so replaying a queue is safe.
- `ready` state shows `online` and `pendingCount`, for the "Offline · 3 changes waiting to sync" banner.
- Signing out forgets the device copy, including unsent changes.

**Done when** scenario tests cover:

1. Start, check items and complete a trip fully offline, then reconnect. The server ends up correct.
2. Alex adds an item mid-trip while Doug is offline. It survives Doug's offline complete.
3. Replaying the same queue twice gives the same result.
4. Reloading the app while offline (a new engine on the same `LocalStore`) keeps the queue.

## M5: Bare-bones harness UI ✅

- `web` with React + Vite and an unstyled page: sign in, list with quick add, catalog, shop/check/complete. Plus controls that copy the mockup's panel: switch user, go offline, reset.
- Runs on the in-memory adapter. Components only read engine state and call commands. One hook (`useEngine`, built on `useSyncExternalStore`) connects them.

Run it with `npm run dev`. Two phones (Doug and Alex) sit side by side, each with Online, Server reachable and Relaunch app controls. `npm run check` now also builds the web app.

**Done when:** you can do the whole loop in the browser, including an offline trip. No component contains business logic. Anything that isn't a render or a command call is a sign logic is leaking from `core`.

## M6: Supabase schema ✅

- One hosted Supabase project (no local Supabase, no Docker), managed through the Supabase MCP. See [supabase/README.md](../supabase/README.md).
- Migration for every table in the data model, the indexes (case-insensitive unique name, one entry per item, one trip in progress per household), composite keys so rows can't cross households, `private.is_member()`, access rules on every table, grants to `authenticated` only, and the `complete_trip` function.
- Seed: the "Home" household with the v1 catalog (17 categories, 85 items). Accounts are created in the dashboard and added as members.

**Done when:** SQL checks show a member can read and write their household, a non-member can't see anything, and `complete_trip` is all-or-nothing (`supabase/tests/access.sql`, 18 checks), and both accounts see the seeded household.

## M7: Supabase adapter ✅

- `adapter-supabase` implements the ports with `supabase-js`. The app calls three database functions and never touches tables directly: `my_households`, `load_household` (one consistent snapshot) and `apply_mutation` (one request per change, atomic, serialized per household). The SQL returns core's JSON shapes, and the adapter only checks them and brands the ids (`decode.ts`).
- `apply_mutation` mirrors core's `applyMutation` rules. The contract suite is what keeps the two in step.
- Live updates use Broadcast from database triggers to a private channel per household, with a `realtime.messages` policy that only lets members join. Postgres Changes was dropped because it sends deletes to every subscriber.
- `BackendPort.subscribe` now promises that changes committed after a following `loadHousehold` are delivered. The adapter makes a load wait for a channel that is still joining, so the engine's "subscribe, then load" holds on a real network.
- `npm run test:live` runs the contract against the hosted project with throwaway accounts (service key from `.env.local`). `npm run check` stays offline.
- `npm run dev:supabase`: the harness with one phone per window on the hosted project. Online and Server reachable are simulated by the adapter.

Known gaps, for M9: the device copy is in memory (a reload loses the offline queue), and if the live channel drops and rejoins without the browser going offline, changes in between show up only on the next reload.

**Done when:** the M2 contract suite passes against the hosted project (26 of 26), and the harness, pointed at Supabase through an env flag, does a real trip between two browser windows.

## M8: Real UI (one screen per step)

Built to match the mockup, still against the engine only:

- **8a** Sign in + account sheet ✅. `npm run dev` now opens the real app (in-memory sample household, prefilled as Doug); `npm run dev:supabase` the real app on the hosted project; `?harness` opens the old harness on either. The session user now carries their email. Figtree is bundled (no font CDN), and screens are tested with Testing Library on happy-dom (`src/composition/app.test.tsx`).
- **8b** List + quick add + create item + notes
- **8c** Catalog + item editor (categories in order)
- **8d** Shopping + complete + summary + offline banner

**Done when:** each screen matches the mockup and works on the in-memory and Supabase adapters.

## M9: PWA and deploy

- Web manifest, icons, and a service worker that saves the app files so it opens without a connection (`vite-plugin-pwa`).
- GitHub Actions builds and deploys to GitHub Pages on every push to `main`.

**Done when:** it's installed on both phones and you complete one real shopping trip with it.
