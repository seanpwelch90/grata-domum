"use client";
import { useState } from "react";
import { adminApi } from "../client";
export function Setup({ onDone }: { onDone: () => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [timeZone, setTimeZone] = useState(
    () =>
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="host">
      <main className="host-auth">
        <p className="eyebrow">Grata Domum</p>
        <h1>Set up the house</h1>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError("");
            try {
              await adminApi("/api/v1/admin/setup", {
                method: "POST",
                body: JSON.stringify({ name, password, timeZone }),
              });
              await onDone();
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "Setup did not work.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Household name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Password (at least 8 characters)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            Time zone
            <input
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create the home"}
          </button>
        </form>
      </main>
    </div>
  );
}

export function Login({ onDone }: { onDone: () => Promise<unknown> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="host">
      <main className="host-auth">
        <p className="eyebrow">Grata Domum</p>
        <h1>Welcome back</h1>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError("");
            try {
              await adminApi("/api/v1/admin/login", {
                method: "POST",
                body: JSON.stringify({ password }),
              });
              await onDone();
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "That password is not right.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
