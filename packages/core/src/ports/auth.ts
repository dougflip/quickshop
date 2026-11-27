import type { UserId } from "../domain/ids.ts";
import type { Result } from "../domain/result.ts";

export type SessionUser = {
  readonly id: UserId;
  readonly displayName: string;
  /** What they signed in with, for the account screen. */
  readonly email: string;
};
export type Session = { readonly user: SessionUser };

export type AuthError = { readonly kind: "invalidCredentials" } | { readonly kind: "unavailable" };

export type AuthPort = {
  /** The session saved on this device, if any. Works offline. */
  currentSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Result<Session, AuthError>>;
  signOut(): Promise<void>;
};
