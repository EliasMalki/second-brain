"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Sending…" : "Send magic link"}
    </button>
  );
}

function LoginInner() {
  const [state, formAction] = useFormState(requestMagicLink, initialState);
  const expired = useSearchParams().get("expired") === "1";

  return (
    <main className="container" style={{ paddingTop: "4rem", maxWidth: "26rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 18,
          fontWeight: 600,
          marginBottom: "var(--space-6)",
          color: "var(--color-text-primary)",
        }}
      >
        <i className="ti ti-brain" aria-hidden="true" />
        Second Brain
      </div>
      {expired && !state.sent ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--color-text-warning)",
            background: "var(--color-background-warning)",
            borderRadius: "var(--border-radius-md)",
            padding: "8px 12px",
            marginBottom: "var(--space-4)",
          }}
        >
          <i className="ti ti-clock-exclamation" aria-hidden="true" />
          Your session expired — sign in again.
        </div>
      ) : null}
      {state.sent ? (
        <div className="card">
          <h1>Check your email</h1>
          <p>
            We sent you a magic link. Open it on this device to finish signing
            in.
          </p>
        </div>
      ) : (
        <div className="card">
          <h1>Sign in</h1>
          <p className="help">
            Enter your email and we&apos;ll send you a magic link.
          </p>
          <form action={formAction} className="form">
            <div className="field">
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
              />
            </div>
            <div className="form-actions">
              <SubmitButton />
              {state.error ? (
                <p role="alert" className="error">
                  {state.error}
                </p>
              ) : null}
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
