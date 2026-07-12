import type { Database } from "../types/database";

export type Priority = Database["public"]["Enums"]["priority"];
export type Effort = Database["public"]["Enums"]["effort"];

/**
 * The canonical A–D / quick–deep allow-lists. Single source of truth — apps
 * must import these, never re-declare the literals.
 */
export const PRIORITIES: readonly Priority[] = ["A", "B", "C", "D"];
export const EFFORTS: readonly Effort[] = ["quick", "deep"];

/** Sort weight: A first. */
export const PRIORITY_ORDER: Record<Priority, number> = { A: 0, B: 1, C: 2, D: 3 };
