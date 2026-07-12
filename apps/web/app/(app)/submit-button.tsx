"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that reflects its form's pending state (disables + swaps to a
 * "working" label) via useFormStatus — so multi-second server actions don't look
 * idle and can't be double-fired. Must be rendered inside the <form> it submits.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
