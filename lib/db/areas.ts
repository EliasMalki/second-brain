import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/db/org";
import type { Database } from "@/lib/database.types";

export type Area = Database["public"]["Tables"]["areas"]["Row"];
export type AreaKind = Database["public"]["Enums"]["area_kind"];

/**
 * Areas data access. Like every db/* module: reads filter by org_id, writes set
 * it, RLS is the backstop. v0.5 uses areas only to group projects Business vs
 * Personal in the sidebar — no standalone areas UI.
 */
export async function listAreas(): Promise<Area[]> {
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("areas")
    .select("*")
    .eq("org_id", orgId)
    .order("kind", { ascending: true }) // 'business' < 'personal'
    .order("name", { ascending: true });

  if (error) throw new Error(`listAreas: ${error.message}`);
  return data;
}

/**
 * Lazily seed the two default areas (Business / Personal) so projects can be
 * grouped and the project form can offer a choice. Idempotent — returns the
 * existing areas untouched if any exist. Wrapped in cache() so the layout and
 * a page rendering in the same request don't both try to insert.
 */
export const ensureDefaultAreas = cache(async (): Promise<Area[]> => {
  const existing = await listAreas();
  if (existing.length > 0) return existing;

  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("areas")
    .insert([
      { org_id: orgId, name: "Business", kind: "business" },
      { org_id: orgId, name: "Personal", kind: "personal" },
    ])
    .select();

  if (error) throw new Error(`ensureDefaultAreas: ${error.message}`);
  return data;
});
