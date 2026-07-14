import { useCallback, useEffect, useState } from "react";
import { listAreas } from "@second-brain/shared/db/areas";
import { listProjects } from "@second-brain/shared/db/projects";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";

export type NavProject = {
  id: string;
  name: string;
  paused: boolean;
  color: string | null;
};
export type NavGroup = { label: string; projects: NavProject[] };

/**
 * Drawer project groups — the same grouping web's app layout builds for its
 * sidebar: projects bucketed under their area's kind (Business / Personal),
 * area-less ones in a neutral "Projects" group, empty groups dropped. Active +
 * paused only (listProjects excludes archived by default — you don't navigate
 * to archived projects).
 */
export function useNavProjects(): { groups: NavGroup[]; refresh: () => void } {
  const { orgId } = useAuth();
  const [groups, setGroups] = useState<NavGroup[]>([]);

  const refresh = useCallback(() => {
    if (!orgId) return;
    void (async () => {
      try {
        const [projects, areas] = await Promise.all([
          listProjects(supabase, orgId),
          listAreas(supabase, orgId),
        ]);
        const areaKind = new Map(areas.map((a) => [a.id, a.kind]));
        const buckets: Record<"business" | "personal" | "other", NavProject[]> =
          { business: [], personal: [], other: [] };
        for (const p of projects) {
          const kind = p.area_id ? areaKind.get(p.area_id) : undefined;
          buckets[kind ?? "other"].push({
            id: p.id,
            name: p.name,
            paused: p.status === "paused",
            color: p.color,
          });
        }
        setGroups(
          [
            { label: "Business", projects: buckets.business },
            { label: "Personal", projects: buckets.personal },
            { label: "Projects", projects: buckets.other },
          ].filter((g) => g.projects.length > 0),
        );
      } catch {
        // Navigation stays usable without project rows; the next drawer open
        // retries. Nothing to surface — this is chrome, not content.
      }
    })();
  }, [orgId]);

  useEffect(refresh, [refresh]);
  return { groups, refresh };
}
