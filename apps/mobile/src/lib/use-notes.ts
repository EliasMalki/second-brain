import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  createNote,
  listNotes,
  searchNotes,
  setNoteArchived,
  setNotePinned,
  updateNote,
  type Note,
} from "@second-brain/shared/db/notes";
import { listProjects } from "@second-brain/shared/db/projects";
import { listAreas } from "@second-brain/shared/db/areas";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";

export type ProjectMeta = { name: string; color: string | null };
export type NoteProject = {
  id: string;
  name: string;
  color: string | null;
  paused: boolean;
};
/** Projects bucketed by area (Business / Personal / Projects), like the drawer. */
export type NoteGroup = { label: string; projects: NoteProject[] };

type ProjectRow = {
  id: string;
  name: string;
  color: string | null;
  status: string;
  area_id: string | null;
};

/** pinned first, then newest-edited — the same order web uses. */
function sortNotes(list: Note[]): Note[] {
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.updated_at.localeCompare(a.updated_at),
  );
}

export type NotesData = {
  loading: boolean;
  refreshing: boolean;
  /** All non-archived notes, pinned-first. Screens filter by folder. */
  notes: Note[];
  folderGroups: NoteGroup[];
  projectsById: Record<string, ProjectMeta>;
  counts: { all: number; inbox: number; pinned: number };
  projectCounts: ReadonlyMap<string, number>;
  refresh: () => void;
  /** Create an empty note filed to `projectId` (null = Inbox); splice + return. */
  create: (projectId: string | null) => Promise<Note>;
  togglePin: (id: string, pinned: boolean) => void;
  move: (id: string, projectId: string | null) => void;
  /** Optimistically remove; returns the removed row so the caller can undo. */
  archive: (id: string) => Note | null;
  unarchive: (note: Note) => void;
  search: (q: string) => Promise<Note[]>;
};

/**
 * Notes data for the home + list screens — all direct org-scoped shared
 * reads/writes (no web route; note editing isn't the capture pipeline).
 * Refetches on focus so edits from the editor screen / captures show up.
 * Mutations are optimistic and reconcile against the returned row.
 */
export function useNotes(): NotesData {
  const { orgId, session } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectRow[]>([]);
  const [areaKind, setAreaKind] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!orgId) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [rows, projs, areas] = await Promise.all([
          listNotes(supabase, orgId),
          listProjects(supabase, orgId, { includeArchived: true }),
          listAreas(supabase, orgId),
        ]);
        setNotes(sortNotes(rows));
        setAllProjects(
          projs.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            status: p.status,
            area_id: p.area_id,
          })),
        );
        setAreaKind(new Map(areas.map((a) => [a.id, a.kind])));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId],
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );
  const refresh = useCallback(() => void load("refresh"), [load]);

  // Projects grouped by area (active + paused only — you don't file into an
  // archived project), empty groups dropped. Matches the drawer's grouping.
  const folderGroups = useMemo<NoteGroup[]>(() => {
    const buckets: Record<"business" | "personal" | "other", NoteProject[]> = {
      business: [],
      personal: [],
      other: [],
    };
    for (const p of allProjects) {
      if (p.status === "archived") continue;
      const kind = p.area_id ? areaKind.get(p.area_id) : undefined;
      buckets[(kind as "business" | "personal") ?? "other"].push({
        id: p.id,
        name: p.name,
        color: p.color,
        paused: p.status === "paused",
      });
    }
    return [
      { label: "Business", projects: buckets.business },
      { label: "Personal", projects: buckets.personal },
      { label: "Projects", projects: buckets.other },
    ].filter((g) => g.projects.length > 0);
  }, [allProjects, areaKind]);

  // name/color for EVERY project (incl. archived) so a note filed under an
  // archived project still resolves its label.
  const projectsById = useMemo(() => {
    const map: Record<string, ProjectMeta> = {};
    for (const p of allProjects) map[p.id] = { name: p.name, color: p.color };
    return map;
  }, [allProjects]);

  const counts = useMemo(
    () => ({
      all: notes.length,
      inbox: notes.filter((n) => n.project_id === null).length,
      pinned: notes.filter((n) => n.pinned).length,
    }),
    [notes],
  );

  const projectCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes)
      if (n.project_id)
        map.set(n.project_id, (map.get(n.project_id) ?? 0) + 1);
    return map;
  }, [notes]);

  const create = useCallback(
    async (projectId: string | null) => {
      if (!orgId || !session) throw new Error("Not signed in.");
      const created = await createNote(supabase, orgId, session.user.id, {
        body: "",
        projectId,
      });
      setNotes((ns) => sortNotes([created, ...ns]));
      return created;
    },
    [orgId, session],
  );

  const togglePin = useCallback(
    (id: string, pinned: boolean) => {
      if (!orgId) return;
      setNotes((ns) =>
        sortNotes(ns.map((n) => (n.id === id ? { ...n, pinned } : n))),
      );
      void setNotePinned(supabase, orgId, id, pinned).catch(() => refresh());
    },
    [orgId, refresh],
  );

  const move = useCallback(
    (id: string, projectId: string | null) => {
      if (!orgId) return;
      setNotes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, project_id: projectId } : n)),
      );
      void updateNote(supabase, orgId, id, { projectId }).catch(() => refresh());
    },
    [orgId, refresh],
  );

  const archive = useCallback(
    (id: string): Note | null => {
      if (!orgId) return null;
      const row = notes.find((n) => n.id === id) ?? null;
      setNotes((ns) => ns.filter((n) => n.id !== id));
      void setNoteArchived(supabase, orgId, id, true).catch(() => refresh());
      return row;
    },
    [orgId, notes, refresh],
  );

  const unarchive = useCallback(
    (note: Note) => {
      if (!orgId) return;
      setNotes((ns) => sortNotes([{ ...note, archived: false }, ...ns]));
      void setNoteArchived(supabase, orgId, note.id, false).catch(() =>
        refresh(),
      );
    },
    [orgId, refresh],
  );

  const search = useCallback(
    (q: string): Promise<Note[]> => {
      if (!orgId) return Promise.resolve([]);
      return searchNotes(supabase, orgId, q);
    },
    [orgId],
  );

  return {
    loading,
    refreshing,
    notes,
    folderGroups,
    projectsById,
    counts,
    projectCounts,
    refresh,
    create,
    togglePin,
    move,
    archive,
    unarchive,
    search,
  };
}
