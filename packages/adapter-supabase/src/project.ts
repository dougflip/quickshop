/** Where a Supabase project lives and the key the app uses to talk to it. */
export type SupabaseProject = {
  readonly url: string;
  /** Safe to ship in the app: access is decided by sign-in and the database's access rules. */
  readonly publishableKey: string;
};

/** The one hosted QuickShop project. See supabase/README.md. */
export const hostedProject: SupabaseProject = {
  url: "https://xbkzulooitgqvtlbhznt.supabase.co",
  publishableKey: "sb_publishable_E7rpxzpYxfk9vDv0qGJ-Iw_cc_eniY2",
};
