// Session restore without the hosted project: the network is replaced, so these run in `check`.
import { describe, expect, it } from "vitest";
import { createSupabaseConnection, type SessionStorage } from "./connection.ts";
import { hostedProject } from "./project.ts";

const storageKey = "test-session";
const user = { id: "6b1c6c2e-1111-4a5b-9d2e-0123456789ab", email: "doug@example.com" };

/** A session supabase-js saved an hour ago, whose access token has since expired. */
function savedStorage(): SessionStorage {
  const values = new Map<string, string>([
    [
      storageKey,
      JSON.stringify({
        access_token: "expired",
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) - 60,
        user: { ...user, aud: "authenticated", role: "authenticated" },
      }),
    ],
    [`${storageKey}-profile`, JSON.stringify({ userId: user.id, displayName: "Doug" })],
  ]);
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

function connect(fetch: typeof globalThis.fetch) {
  return createSupabaseConnection({
    project: hostedProject,
    storage: savedStorage(),
    storageKey,
    autoRefreshToken: false,
    fetch,
    sessionWaitMs: 200,
  });
}

const expected = { user: { id: user.id, displayName: "Doug", email: user.email } };
const noNetwork: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));

/** The server answering that the refresh token is no longer valid. */
const revoked: typeof fetch = () =>
  Promise.resolve(
    Response.json(
      { code: "refresh_token_not_found", message: "Invalid Refresh Token" },
      { status: 400 },
    ),
  );

describe("restoring a saved session", () => {
  it("keeps the person signed in when the phone is offline", async () => {
    const connection = connect(noNetwork);
    connection.setOnline(false);
    expect(await connection.auth.currentSession()).toEqual(expected);
  });

  it("keeps them signed in when the token can't be refreshed for lack of signal", async () => {
    const connection = connect(noNetwork);
    expect(await connection.auth.currentSession()).toEqual(expected);
  });

  it("signs them out when the server says the session is gone", async () => {
    const connection = connect(revoked);
    expect(await connection.auth.currentSession()).toBeNull();
  });
});
