import {
  asUserId,
  err,
  ok,
  type AuthPort,
  type BackendError,
  type BackendPort,
  type Change,
  type HouseholdId,
  type NetworkStatus,
  type Result,
  type Session,
} from "@quickshop/core";
import {
  createClient,
  isAuthRetryableFetchError,
  type REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { decodeApplyResult, decodeChange, decodeHouseholds, decodeSnapshot } from "./decode.ts";
import type { SupabaseProject } from "./project.ts";

/** Key-value storage for the session, like `localStorage`. */
export type SessionStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

export type SupabaseConnectionOptions = {
  readonly project: SupabaseProject;
  /** Where the signed-in session is kept between launches. `localStorage` in a browser. */
  readonly storage: SessionStorage;
  /** Keeps several connections in one page apart, like the harness's two phones. */
  readonly storageKey: string;
  /** Refresh the session before it expires. On in the app; tests turn it off. */
  readonly autoRefreshToken?: boolean;
  /** Replaces the network, for tests. */
  readonly fetch?: typeof fetch;
  /** How long to wait for the server when restoring a session. Default 3 seconds. */
  readonly sessionWaitMs?: number;
};

/** One device talking to the hosted project. */
export type SupabaseConnection = {
  readonly auth: AuthPort;
  readonly backend: BackendPort;
  /** The browser's online status, unless the harness or a test says otherwise. */
  readonly network: NetworkStatus;
  /** Pretends the device lost (or regained) its connection. For the harness and tests. */
  setOnline(online: boolean): void;
  /**
   * Pretends requests fail while the device still believes it is online, like captive Wi-Fi.
   * For the harness and tests.
   */
  setServerReachable(reachable: boolean): void;
  /** Leaves every live channel and closes the socket. */
  close(): Promise<void>;
};

/** How long a new live subscription may hold up a load before the load goes ahead anyway. */
const joinTimeoutMs = 10_000;

type Topic = {
  readonly channel: RealtimeChannel;
  readonly listeners: Set<(change: Change) => void>;
  /** Told when the channel joins again after dropping, since changes in the gap were missed. */
  readonly reconnectListeners: Set<() => void>;
  /** Settles once joining has succeeded or failed. */
  readonly joined: Promise<void>;
};

type ProfileCache = { readonly userId: string; readonly displayName: string };

export function createSupabaseConnection(options: SupabaseConnectionOptions): SupabaseConnection {
  const client: SupabaseClient = createClient(options.project.url, options.project.publishableKey, {
    auth: {
      storage: options.storage,
      storageKey: options.storageKey,
      persistSession: true,
      autoRefreshToken: options.autoRefreshToken ?? true,
      detectSessionInUrl: false,
    },
    ...(options.fetch === undefined ? {} : { global: { fetch: options.fetch } }),
  });
  const profileKey = `${options.storageKey}-profile`;
  const sessionWaitMs = options.sessionWaitMs ?? 3000;
  const simulated = { online: true, reachable: true };
  const topics = new Map<HouseholdId, Topic>();
  const network = createNetworkStatus(() => simulated.online);

  /** Whether a request has any chance of reaching the server. */
  const canReach = () => network.status.isOnline() && simulated.reachable;

  // ---- Auth ----

  async function displayNameFor(userId: string, email: string | undefined): Promise<string> {
    const cached = await readProfile();
    if (cached?.userId === userId) return cached.displayName;
    const { data } = await client
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle<{ display_name: string }>();
    const displayName = data?.display_name ?? email?.split("@")[0] ?? "Me";
    if (data !== null)
      await options.storage.setItem(profileKey, JSON.stringify({ userId, displayName }));
    return displayName;
  }

  async function readProfile(): Promise<ProfileCache | null> {
    const raw = await options.storage.getItem(profileKey);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" &&
        parsed !== null &&
        "userId" in parsed &&
        typeof parsed.userId === "string" &&
        "displayName" in parsed &&
        typeof parsed.displayName === "string"
        ? { userId: parsed.userId, displayName: parsed.displayName }
        : null;
    } catch {
      return null;
    }
  }

  /**
   * The signed-in user, refreshing an expired session if needed. A refresh that can't reach the
   * server retries for up to half a minute, so give up waiting after a few seconds.
   */
  async function liveOrSavedUser(): Promise<{ id: string; email?: string } | undefined> {
    const slow = Symbol("slow");
    const loaded = await Promise.race([
      client.auth.getSession(),
      new Promise<typeof slow>((resolve) => setTimeout(() => resolve(slow), sessionWaitMs)),
    ]);
    if (loaded === slow) return savedUser();
    const { data, error } = loaded;
    if (data.session !== null) return data.session.user;
    // A refresh that failed for lack of network leaves the session saved; any other failure
    // (the session was revoked, say) means signed out.
    return error !== null && isAuthRetryableFetchError(error) ? savedUser() : undefined;
  }

  /** The user in the session supabase-js saved, if any. */
  async function savedUser(): Promise<{ id: string; email?: string } | undefined> {
    const raw = await options.storage.getItem(options.storageKey);
    if (raw === null) return undefined;
    try {
      const saved: unknown = JSON.parse(raw);
      if (typeof saved !== "object" || saved === null || !("user" in saved)) return undefined;
      const { user } = saved;
      if (typeof user !== "object" || user === null || !("id" in user)) return undefined;
      if (typeof user.id !== "string") return undefined;
      const email = "email" in user && typeof user.email === "string" ? user.email : undefined;
      return email === undefined ? { id: user.id } : { id: user.id, email };
    } catch {
      return undefined;
    }
  }

  const auth: AuthPort = {
    currentSession: async () => {
      // Opening in a store with no signal must not mean signing in again. Offline, or when the
      // server is slow to answer, use the user saved on this device; requests still need a
      // valid token, which supabase-js refreshes once the connection is back.
      const user = canReach() ? await liveOrSavedUser() : await savedUser();
      if (user === undefined) return null;
      return {
        user: {
          id: asUserId(user.id),
          displayName: await displayNameFor(user.id, user.email),
          email: user.email ?? "",
        },
      };
    },
    signIn: async (email, password) => {
      if (!canReach()) return err({ kind: "unavailable" });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error !== null) {
        return err(error.status === 400 ? { kind: "invalidCredentials" } : { kind: "unavailable" });
      }
      const { user } = data;
      await options.storage.removeItem(profileKey);
      const session: Session = {
        user: {
          id: asUserId(user.id),
          displayName: await displayNameFor(user.id, user.email),
          email: user.email ?? "",
        },
      };
      return ok(session);
    },
    signOut: async () => {
      for (const topic of topics.values()) void client.removeChannel(topic.channel);
      topics.clear();
      await options.storage.removeItem(profileKey);
      // Local scope: forget the session on this device only. Works offline.
      await client.auth.signOut({ scope: "local" });
    },
  };

  // ---- Backend ----

  /** Calls a database function, mapping failures to what the engine understands. */
  async function call(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<Result<unknown, BackendError>> {
    if (!canReach()) return err({ kind: "unavailable" });
    const { data, error, status } = await client.rpc(fn, args);
    if (error === null) return ok<unknown>(data);
    // Signed out (or the session is no longer valid): the database refuses the anonymous role.
    if (status === 401 || status === 403 || error.code === "42501") {
      return err({ kind: "unauthorized" });
    }
    // Anything else is a network failure or a server problem; the engine retries either way.
    return err({ kind: "unavailable" });
  }

  const backend: BackendPort = {
    listHouseholds: async () => decoded(await call("my_households", {}), decodeHouseholds),

    loadHousehold: async (householdId) => {
      // Let a subscription that is still joining finish first, so nothing committed after this
      // load can be missed.
      await topics.get(householdId)?.joined;
      const result = await call("load_household", { household: householdId });
      if (result.ok && result.value === null) return err({ kind: "unauthorized" });
      return decoded(result, decodeSnapshot);
    },

    apply: async (householdId, mutation) => {
      const result = decoded(
        await call("apply_mutation", { household: householdId, mutation }),
        decodeApplyResult,
      );
      if (!result.ok) return result;
      const outcome = result.value;
      switch (outcome.kind) {
        case "applied":
        case "ignored":
          return ok(outcome.kind);
        case "rejected":
          return err({ kind: "rejected", reason: outcome.reason });
        case "unauthorized":
          return err({ kind: "unauthorized" });
      }
    },

    subscribe: (householdId, onChange, onReconnect) => {
      const topic = topics.get(householdId) ?? join(householdId);
      topic.listeners.add(onChange);
      if (onReconnect !== undefined) topic.reconnectListeners.add(onReconnect);
      return () => {
        topic.listeners.delete(onChange);
        if (onReconnect !== undefined) topic.reconnectListeners.delete(onReconnect);
        if (topic.listeners.size > 0 || topics.get(householdId) !== topic) return;
        topics.delete(householdId);
        void client.removeChannel(topic.channel);
      };
    },
  };

  /** Joins the household's private channel. Only members are let in (realtime.messages policy). */
  function join(householdId: HouseholdId): Topic {
    const listeners = new Set<(change: Change) => void>();
    const reconnectListeners = new Set<() => void>();
    const channel = client.channel(`household:${householdId}`, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, (message) => {
      // While "offline", nothing arrives, the same as a real dropped connection.
      if (!canReach()) return;
      let change: Change;
      try {
        change = decodeChange(message["payload"]);
      } catch (error) {
        console.error("QuickShop: ignored a live change the app doesn't understand", error);
        return;
      }
      for (const listener of listeners) listener(change);
    });
    let everJoined = false;
    const joined = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, joinTimeoutMs);
      // Called for the first join and again each time the channel rejoins after a drop
      // (the socket reconnecting, the phone waking up).
      const onStatus = (status: `${REALTIME_SUBSCRIBE_STATES}`) => {
        clearTimeout(timer);
        resolve();
        if (status !== "SUBSCRIBED") return;
        if (everJoined) for (const listener of reconnectListeners) listener();
        everJoined = true;
      };
      // The channel's access check uses the signed-in user's token.
      client.realtime
        .setAuth()
        .then(() => channel.subscribe(onStatus))
        .catch(() => onStatus("CHANNEL_ERROR"));
    });
    const topic: Topic = { channel, listeners, reconnectListeners, joined };
    topics.set(householdId, topic);
    return topic;
  }

  return {
    auth,
    backend,
    network: network.status,
    setOnline: (online) => {
      simulated.online = online;
      network.changed();
    },
    setServerReachable: (reachable) => {
      simulated.reachable = reachable;
    },
    close: async () => {
      topics.clear();
      await client.removeAllChannels();
      await client.realtime.disconnect();
    },
  };
}

/** Checks what the database sent. A mismatch is a bug, reported and treated as a failed request. */
function decoded<T>(
  result: Result<unknown, BackendError>,
  decode: (value: unknown) => T,
): Result<T, BackendError> {
  if (!result.ok) return result;
  try {
    return ok(decode(result.value));
  } catch (error) {
    console.error("QuickShop: the database sent something the app doesn't understand", error);
    return err({ kind: "unavailable" });
  }
}

/** Browser online/offline events combined with the simulated switch. Always online outside a browser. */
function createNetworkStatus(simulatedOnline: () => boolean) {
  const listeners = new Set<(online: boolean) => void>();
  // Outside a browser (tests on Node) these may be missing.
  const browser: {
    navigator?: { onLine?: boolean };
    addEventListener?: (type: "online" | "offline", listener: () => void) => void;
  } = globalThis;
  const browserOnline = () => browser.navigator?.onLine ?? true;
  const isOnline = () => browserOnline() && simulatedOnline();
  let last = isOnline();

  const changed = () => {
    const now = isOnline();
    if (now === last) return;
    last = now;
    for (const listener of listeners) listener(now);
  };
  browser.addEventListener?.("online", changed);
  browser.addEventListener?.("offline", changed);

  const status: NetworkStatus = {
    isOnline,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { status, changed };
}
