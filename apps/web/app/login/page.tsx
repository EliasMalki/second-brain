"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  requestMagicLink,
  signInWithPassword,
  type LoginState,
} from "./actions";

const initialState: LoginState = {};

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

function ModeToggle({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: "var(--space-4)",
        background: "none",
        border: 0,
        padding: 0,
        fontSize: 13,
        color: "var(--color-text-secondary)",
        textDecoration: "underline",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function MagicLinkForm({ onUsePassword }: { onUsePassword: () => void }) {
  const [state, formAction] = useFormState(requestMagicLink, initialState);

  if (state.sent) {
    return (
      <div className="card">
        <h1>Check your email</h1>
        <p>
          We sent you a magic link. Open it on this device to finish signing in.
        </p>
      </div>
    );
  }

  return (
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
          <SubmitButton idle="Send magic link" busy="Sending…" />
          {state.error ? (
            <p role="alert" className="error">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
      <ModeToggle onClick={onUsePassword} label="Use a password instead" />
    </div>
  );
}

function PasswordForm({ onUseMagicLink }: { onUseMagicLink: () => void }) {
  const [state, formAction] = useFormState(signInWithPassword, initialState);

  return (
    <div className="card">
      <h1>Sign in</h1>
      <p className="help">Enter your username and password.</p>
      <form action={formAction} className="form">
        <div className="field">
          <label htmlFor="pw-username" className="label">
            Username
          </label>
          <input
            id="pw-username"
            name="username"
            type="text"
            className="input"
            required
            autoCapitalize="none"
            autoComplete="username"
            autoFocus
            placeholder="jane"
          />
        </div>
        <div className="field">
          <label htmlFor="pw-password" className="label">
            Password
          </label>
          <input
            id="pw-password"
            name="password"
            type="password"
            className="input"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        <div className="form-actions">
          <SubmitButton idle="Sign in" busy="Signing in…" />
          {state.error ? (
            <p role="alert" className="error">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
      <ModeToggle onClick={onUseMagicLink} label="Email me a magic link instead" />
    </div>
  );
}

function LoginInner() {
  const [mode, setMode] = useState<"magic" | "password">("magic");
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
        Servo
      </div>
      {expired ? (
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
      {mode === "magic" ? (
        <MagicLinkForm onUsePassword={() => setMode("password")} />
      ) : (
        <PasswordForm onUseMagicLink={() => setMode("magic")} />
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
