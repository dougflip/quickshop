import type { AuthError, Engine } from "@quickshop/core";
import { useState, type FormEvent } from "react";

export type SignInDefaults = {
  readonly email: string;
  readonly password: string;
  /** Shown under the form, e.g. the sample accounts on the in-memory backend. */
  readonly hint: string;
};

function message(error: AuthError): string {
  switch (error.kind) {
    case "invalidCredentials":
      return "That email and password don't match.";
    case "unavailable":
      return "Can't reach QuickShop. Check your connection and try again.";
  }
}

export function SignIn({
  engine,
  busy,
  error,
  defaults,
}: {
  engine: Engine;
  busy: boolean;
  error: AuthError | null;
  defaults: SignInDefaults;
}) {
  const [email, setEmail] = useState(defaults.email);
  const [password, setPassword] = useState(defaults.password);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void engine.signIn(email.trim(), password);
  };
  return (
    <>
      <div className="hero">
        <Basket />
        <h1>QuickShop</h1>
        <p>One list for the household.</p>
      </div>
      <form className="form" onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input
          className="field"
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          className="field"
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error !== null && (
          <p className="error" role="alert">
            {message(error)}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="hint">{defaults.hint}</p>
      </form>
    </>
  );
}

/** The hero illustration from the mockup: a basket with greens, a tomato and a baguette. */
function Basket() {
  return (
    <svg viewBox="0 0 320 170" aria-hidden="true">
      <ellipse cx="160" cy="160" rx="110" ry="8" fill="rgb(0 0 0/.18)" />
      <rect
        x="182"
        y="18"
        width="22"
        height="120"
        rx="11"
        transform="rotate(14 193 78)"
        fill="#e0a25a"
      />
      <path
        d="M186 40l14 4M183 62l14 4M180 84l14 4"
        stroke="#b87a35"
        strokeWidth="3"
        strokeLinecap="round"
        transform="rotate(14 193 78)"
      />
      <circle cx="122" cy="62" r="26" fill="#2f9e55" />
      <circle cx="146" cy="50" r="22" fill="#3cb865" />
      <circle cx="104" cy="44" r="18" fill="#3cb865" />
      <circle cx="214" cy="76" r="20" fill="#e5533a" />
      <path
        d="M214 56c2-6 7-9 12-9"
        stroke="#1d5e33"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M86 72h148l-14 86H100z" fill="#f3e2c2" />
      <path d="M86 72h148l-3 18H89z" fill="#e3cca2" />
      <path
        d="M134 104c0 14 52 14 52 0"
        stroke="#c7ad7e"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
