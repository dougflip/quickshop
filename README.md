# QuickShop

A shared, real-time shopping list for a household, installable as a PWA. You build the list together, then one person shops and checks items off, even with a bad signal in the store.

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
  scenarios/        headless end-to-end tests: real engines against the in-memory backend
docs/               planning, data model, milestones, mockup, v1 reference data
```

More packages arrive with each milestone (adapters, web app).

## Development

Requires Node 26 (see `.nvmrc`).

```sh
npm install
npm run check   # typecheck (tsc), lint (oxlint), format check (oxfmt), tests
npm run test:watch
```
