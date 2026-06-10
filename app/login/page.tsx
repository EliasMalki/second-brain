"use client";

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

export default function LoginPage() {
  const [state, formAction] = useFormState(requestMagicLink, initialState);

  return (
    <main className="container" style={{ paddingTop: "4rem", maxWidth: "26rem" }}>
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
