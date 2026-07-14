import type { Db } from "../supabase";
import type { Database } from "../types/database";

export type Area = Database["public"]["Tables"]["areas"]["Row"];
export type AreaKind = Database["public"]["Enums"]["area_kind"];

/**
 * Areas data access (DI form). Areas exist only to group projects Business vs
 * Personal in navigation — no standalone areas UI. Reads filter by org_id; RLS
 * is the backstop. (Web's ensureDefaultAreas seeding WRITE stays in
 * apps/web/lib/db/areas.ts — it's a request-lifecycle concern, not a query.)
 */
export async function listAreas(db: Db, orgId: string): Promise<Area[]> {
  const { data, error } = await db
    .from("areas")
    .select("*")
    .eq("org_id", orgId)
    .order("kind", { ascending: true }) // 'business' < 'personal'
    .order("name", { ascending: true });

  if (error) throw new Error(`listAreas: ${error.message}`);
  return data;
}
