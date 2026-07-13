"use client";

// Extracted to @second-brain/shared so web + mobile share ONE grace-period
// completion hook (identical CONFIRM_MS/GRACE_MS + fire-at-expiry semantics).
// Re-exported here so existing web import sites (./use-row-completion) are
// unchanged.
export {
  useRowCompletion,
  type CompletionPhase,
} from "@second-brain/shared/ui/use-row-completion";
