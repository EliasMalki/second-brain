import { useCallback, useState } from "react";
import { completeTask } from "@second-brain/shared/db/tasks";
import { useRowCompletion } from "@second-brain/shared/ui/use-row-completion";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";
import type { Completion } from "@/components/completing-row";

/**
 * Mobile completion glue shared by Today and Tasks. Wraps the shared grace hook
 * with:
 *  - the real completeTask write (fired at grace expiry — it sets completed_at
 *    AND fires the completion-anchored recurrence hook, never a raw status write),
 *  - a phantom-done guard: if the write fails (e.g. offline the moment grace
 *    fires) un-strike the row + refetch so it stays completable,
 *  - the `completed` set: a fired row stays struck until the next refetch moves
 *    it out of the open list.
 * `refresh` is the screen's refetch, used only on the failure path.
 */
export function useCompletion(refresh: () => void): Completion {
  const { orgId } = useAuth();
  const completing = useRowCompletion();
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const onComplete = useCallback(
    (id: string) => {
      completing.complete(id, {
        completeAction: async () => {
          if (!orgId) return;
          try {
            await completeTask(supabase, orgId, id);
          } catch {
            setCompleted((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            refresh();
          }
        },
        onRemove: () => setCompleted((prev) => new Set(prev).add(id)),
      });
    },
    [completing, orgId, refresh],
  );

  return {
    phaseOf: completing.phaseOf,
    undo: completing.undo,
    onComplete,
    completed,
  };
}
