# QuickShop

A shared, real-time shopping list for a household, installable as a PWA: https://dougflip.github.io/quickshop/ You build the list together, then one person shops and checks items off, even with a bad signal in the store.

**Status:** v2 has replaced v1 and is being tested on real shopping trips from the installed app (see [M9 in the milestones](docs/milestones.md#m9-pwa-and-deploy-shipped-in-field-testing)). Fixes go on a branch with a PR to `main`, and merging deploys.

The long-term goal is a list that knows which store you're in and orders items by your path through it. See [docs/overview.md](docs/overview.md).

## Docs

- [Planning and decisions](docs/planning.md)
- [Data model](docs/data-model.md)
- [Milestones](docs/milestones.md)
- [Clickable mockup](docs/mockups/index.html) (open the file in a browser)

## Layout

```
packages/
  core/             plain TypeScript: domain logic, ports, engine. No UI or provider code
  adapter-memory/   in-memory backend for tests and the harness
  adapter-supabase/ the real backend: the hosted Supabase project
  scenarios/        headless end-to-end tests: real engines against the in-memory backend
  web/              React + Vite app (src/app), plus the test harness (src/harness)
supabase/           migrations, access checks, seed (see supabase/README.md)
docs/               planning, data model, milestones, mockup, v1 reference data
```

## Development

Requires Node 26 (see `.nvmrc`).

```sh
npm install
npm run dev           # the app on an in-memory sample household, http://localhost:5173
npm run dev:supabase  # the app on the hosted project
                      # add ?harness to either URL for the bare-bones test harness
npm run check         # typecheck (tsc), lint (oxlint), format check (oxfmt), tests, build
npm run test:watch
npm run test:live     # the backend contract against the hosted project (needs .env.local)
```

`check` never touches the hosted project. `test:live` needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; it creates throwaway test accounts and deletes them afterwards.

## Deploying

Every push to `main` that passes `check` is deployed to GitHub Pages by CI (`.github/workflows/ci.yml`). `npm run build` makes the same production build locally; `npm run preview -w @quickshop/web` serves it at http://localhost:4173/quickshop/.

## Installing on a phone

- **iPhone (Safari):** open the site, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the site, tap the menu, then **Install app**.

Once installed it opens without a connection. A new version downloads in the background and is used from the next launch (on iPhone, swipe the app away and open it again).
