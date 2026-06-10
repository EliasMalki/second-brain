"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send magic link"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(requestMagicLink, initialState);

  if (state.sent) {
    return (
      <main>
        <h1>Check your email</h1>
        <p>
          We sent you a magic link. Open it on this device to finish signing in.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Sign in</h1>
      <p>Enter your email and we&apos;ll send you a magic link.</p>
      <form action={formAction}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
        />
        <SubmitButton />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
