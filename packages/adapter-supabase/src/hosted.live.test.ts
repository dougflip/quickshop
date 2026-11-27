// The backend contract, run against the hosted project. `npm run test:live` (needs
// SUPABASE_SERVICE_ROLE_KEY in .env.local; see supabase/README.md).
//
// The test accounts and households are created with the service key and deleted afterwards. They
// never touch the real household: every cleanup step checks that it only deletes households whose
// members are all test accounts.
import {
  asCategoryId,
  asEntryId,
  asHouseholdId,
  asItemId,
  asUserId,
  type UserId,
} from "@quickshop/core";
import { backendContract, type ContractPerson, type ContractWorld } from "@quickshop/core/contract";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, inject } from "vitest";
import {
  createSupabaseConnection,
  type SessionStorage,
  type SupabaseConnection,
} from "./connection.ts";
import { hostedProject } from "./project.ts";

declare module "vitest" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- merging needs an interface
  interface ProvidedContext {
    supabaseSecretKey: string;
  }
}

const secretKey = inject("supabaseSecretKey");
if (secretKey === "") {
  throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local to run the live tests.");
}

const admin = createClient(hostedProject.url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const emailPrefix = "qs-contract-";
const run = crypto.randomUUID().slice(0, 8);
const displayNames: Readonly<Record<ContractPerson, string>> = {
  doug: "Doug",
  alex: "Alex",
  olive: "Olive",
};
const newId = () => crypto.randomUUID();

type Account = { readonly id: UserId; readonly email: string; readonly password: string };

let accounts: Promise<Record<ContractPerson, Account>> | undefined;
let householdIds: string[] = [];
let connections: SupabaseConnection[] = [];

type Response = { readonly data: unknown; readonly error: unknown };

/** The data of a successful Supabase response; throws on an error. */
function must<R extends Response>(result: R, what: string): Extract<R, { error: null }>["data"] {
  if (result.error !== null) throw new Error(`${what} failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

/** Deletes households, refusing if any of them has a member who isn't a test account. */
async function deleteHouseholds(ids: readonly string[]) {
  if (ids.length === 0) return;
  const members = must(
    await admin.from("household_members").select("user_id").in("household_id", ids),
    "reading members",
  );
  const testAccounts = new Set(
    must(await admin.auth.admin.listUsers({ perPage: 1000 }), "listing users")
      .users.filter((u) => u.email?.startsWith(emailPrefix) === true)
      .map((u) => u.id),
  );
  for (const m of members as { user_id: string }[]) {
    if (!testAccounts.has(m.user_id)) {
      throw new Error("Refusing to delete a household that has a real member.");
    }
  }
  must(await admin.from("households").delete().in("id", ids), "deleting households");
}

/** Removes test accounts (and their households) left behind by an interrupted run. */
async function removeTestAccounts() {
  const { users } = must(await admin.auth.admin.listUsers({ perPage: 1000 }), "listing users");
  const stale = users.filter((u) => u.email?.startsWith(emailPrefix) === true);
  if (stale.length === 0) return;
  const memberships = must(
    await admin
      .from("household_members")
      .select("household_id")
      .in(
        "user_id",
        stale.map((u) => u.id),
      ),
    "reading memberships",
  ) as { household_id: string }[];
  await deleteHouseholds([...new Set(memberships.map((m) => m.household_id))]);
  const deleted = await Promise.all(stale.map((user) => admin.auth.admin.deleteUser(user.id)));
  for (const result of deleted) must(result, "deleting a user");
}

async function createAccount(person: ContractPerson): Promise<Account> {
  const email = `${emailPrefix}${run}-${person}@example.com`;
  const password = crypto.randomUUID();
  const { user } = must(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayNames[person] },
    }),
    "creating a user",
  );
  return { id: asUserId(user.id), email, password };
}

async function createAccounts(): Promise<Record<ContractPerson, Account>> {
  await removeTestAccounts();
  const [doug, alex, olive] = await Promise.all([
    createAccount("doug"),
    createAccount("alex"),
    createAccount("olive"),
  ]);
  return { doug, alex, olive };
}

function memoryStorage(): SessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

/** A fresh Home and Elsewhere, as ContractWorld describes, replacing the previous test's. */
async function setup(): Promise<ContractWorld> {
  const users = await (accounts ??= createAccounts());
  await deleteHouseholds(householdIds);

  const home = newId();
  const elsewhere = newId();
  const produce = newId();
  const dairy = newId();
  const milk = newId();
  const bananas = newId();
  const milkEntry = newId();
  householdIds = [home, elsewhere];

  must(
    await admin.from("households").insert([
      { id: home, name: "Home" },
      { id: elsewhere, name: "Elsewhere" },
    ]),
    "creating households",
  );
  must(
    await admin.from("household_members").insert([
      { household_id: home, user_id: users.doug.id },
      { household_id: home, user_id: users.alex.id },
      { household_id: elsewhere, user_id: users.olive.id },
    ]),
    "adding members",
  );
  must(
    await admin.from("categories").insert([
      { id: produce, household_id: home, name: "Produce", position: 0 },
      { id: dairy, household_id: home, name: "Dairy", position: 1 },
    ]),
    "creating categories",
  );
  must(
    await admin.from("items").insert([
      { id: milk, household_id: home, name: "Milk" },
      { id: bananas, household_id: home, name: "Bananas" },
    ]),
    "creating items",
  );
  must(
    await admin.from("item_categories").insert([
      { item_id: milk, category_id: dairy, household_id: home, position: 0 },
      { item_id: bananas, category_id: produce, household_id: home, position: 0 },
    ]),
    "categorizing items",
  );
  must(
    await admin.from("list_entries").insert({
      id: milkEntry,
      household_id: home,
      item_id: milk,
      status: "needed",
      added_by: users.doug.id,
      updated_at: "2026-01-01T00:00:00Z",
    }),
    "adding Milk to the list",
  );

  return {
    householdId: asHouseholdId(home),
    otherHouseholdId: asHouseholdId(elsewhere),
    users: { doug: users.doug.id, alex: users.alex.id, olive: users.olive.id },
    credentials: {
      doug: { email: users.doug.email, password: users.doug.password },
      alex: { email: users.alex.email, password: users.alex.password },
      olive: { email: users.olive.email, password: users.olive.password },
    },
    categories: { produce: asCategoryId(produce), dairy: asCategoryId(dairy) },
    items: { milk: asItemId(milk), bananas: asItemId(bananas) },
    entries: { milk: asEntryId(milkEntry) },
    newId,
    connect: () => {
      const connection = createSupabaseConnection({
        project: hostedProject,
        storage: memoryStorage(),
        storageKey: `${emailPrefix}${run}-${String(connections.length)}`,
        autoRefreshToken: false,
      });
      connections.push(connection);
      return Promise.resolve(connection);
    },
    // No way to know when the server has finished broadcasting, so give it a moment.
    settle: () => new Promise((resolve) => setTimeout(resolve, 2000)),
  };
}

afterEach(async () => {
  await Promise.all(connections.map((c) => c.close()));
  connections = [];
});

afterAll(async () => {
  await deleteHouseholds(householdIds);
  householdIds = [];
  await removeTestAccounts();
});

backendContract("supabase (hosted)", setup);
