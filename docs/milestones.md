# Milestones

Each milestone is small and ends with something you can check. The core comes first and is proven to work without any UI (M1–M4). Supabase comes next (M6–M7), and the real UI is last (M8–M9).

See [planning.md](./planning.md) for decisions and [data-model.md](./data-model.md) for the schema.

M0–M5 need no Docker. M6–M7 run Supabase locally through Docker, so they'll be done on a separate development machine.

## Target layout

```
packages/
  core/              plain TS: domain, ports, engine, offline queue. No React, no Supabase
  adapter-memory/    in-memory backend for tests and the harness. Several clients can share one
  adapter-supabase/  implements the ports with Supabase
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

## M6: Supabase schema

- Local Supabase through the Supabase CLI (needs Docker). Migrations for every table in the data model, the indexes (case-insensitive unique name, one entry per item, one trip in progress per household), `is_member()`, access rules on every table, and the `complete_trip` function.
- Seed: two accounts (passwords from an env file, not committed), the "Home" household, categories in your store's order, and a starter catalog from v1's list.

**Done when:** SQL tests show a member can read and write their household, a non-member can't see anything, and `complete_trip` is all-or-nothing.

## M7: Supabase adapter

- Implement every port with `supabase-js`, using Supabase's live-update feature filtered by `household_id`.
- Map database rows to core types inside the adapter only.

**Done when:** the M2 contract suite passes against local Supabase, and the harness, pointed at Supabase through an env flag, does a real trip between two browser windows.

## M8: Real UI (one screen per step)

Built to match the mockup, still against the engine only:

- **8a** Sign in + account sheet
- **8b** List + quick add + create item + notes
- **8c** Catalog + item editor (categories in order)
- **8d** Shopping + complete + summary + offline banner

**Done when:** each screen matches the mockup and works on the in-memory and Supabase adapters.

## M9: PWA and deploy

- Web manifest, icons, and a service worker that saves the app files so it opens without a connection (`vite-plugin-pwa`).
- Hosted Supabase project with the migrations and seed applied.
- GitHub Actions builds and deploys to GitHub Pages on every push to `main`.

**Done when:** it's installed on both phones and you complete one real shopping trip with it.
