# Supabase

QuickShop runs on one hosted Supabase project. There is no local Supabase (and so no Docker).

## Layout

- `migrations/`: the schema, as SQL files named `<version>_<name>.sql`. The repo is the source of truth: every schema change is a file here first, then applied. The version in each filename matches what the project recorded when it was applied (`list_migrations`).
- `tests/access.sql`: access-rule and `complete_trip` checks. They run in a transaction that is always rolled back, so it is safe against the live project. It ends with an error reading `ACCESS CHECKS: n of n passed` plus each check.
- `seed/home.sql`: creates the "Home" household with the starting catalog. Skips itself if "Home" exists.

## Applying changes

With the Supabase MCP connected (see `.mcp.json`):

1. Write the migration file in `migrations/`.
2. Apply its exact contents with `apply_migration`, then rename the file to the version `list_migrations` reports.
3. Run `tests/access.sql` with `execute_sql` and check every result is `ok`.
4. Check `get_advisors` (security and performance).

The Supabase CLI works too (`supabase link`, then `supabase db push`); only `supabase start` needs Docker.

## Accounts

Sign-ups are turned off. Accounts are created in the dashboard (Authentication → Users → Add user, auto-confirmed). A profile is created automatically; its display name starts as the part of the email before the @ and can be changed in `public.profiles`. Add a new account to a household with a row in `public.household_members`.

## Project settings

- Data API: on. Automatic grants on new tables: off (each migration grants to `authenticated` explicitly). Automatic RLS on new tables: on.
- Email sign-in on; new sign-ups off.
