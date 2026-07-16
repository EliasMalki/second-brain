"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "@/lib/db/notes";
import { OrgPane } from "./org-pane";
import { NoteList } from "./note-list";
import { NoteEditor } from "./note-editor";
import { PaneResizer } from "./pane-resizer";
import {
  archiveNoteWorkspaceAction,
  createBlankNoteAction,
  moveNoteAction,
  saveNoteAction,
  setPinAction,
  unarchiveNoteWorkspaceAction,
} from "./actions";
import { UndoToast, useUndoToast } from "../undo-toast";
import type { MoveTarget } from "./move-menu";
import { folderTitle, type Folder, type FolderGroup } from "./workspace-types";

/** pinned first, then newest-edited first — the note list's order. */
function sortNotes(list: Note[]): Note[] {
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.updated_at.localeCompare(a.updated_at),
  );
}

function inFolder(note: Note, folder: Folder): boolean {
  switch (folder.kind) {
    case "all":
      return true;
    case "inbox":
      return note.project_id === null;
    case "pinned":
      return note.pinned;
    case "project":
      return note.project_id === folder.id;
  }
}

/**
 * The three-pane Notes view (Apple-Notes paradigm): org pane · gallery/list ·
 * editor. With no note selected the workspace is in BROWSE MODE — the gallery
 * expands over the editor's space (the landing hero); opening a note brings
 * the editor in and the gallery narrows to a card strip. Selection deep-links
 * via ?note=<id> (read server-side, mirrored with history.replaceState — no
 * server roundtrip). Holds all selection state and a local copy of the notes
 * seeded from the server; mutations call server actions and patch local state
 * so the UI stays snappy. The actions also revalidate /notes, so other views
 * (Inbox, project pages, search) stay correct.
 */
export function NotesWorkspace({
  initialNotes,
  folderGroups,
  initialSelectedId,
}: {
  initialNotes: Note[];
  folderGroups: FolderGroup[];
  initialSelectedId: string | null;
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [folder, setFolder] = useState<Folder>({ kind: "all" });
  // Browse mode (null) is the landing state; a ?note= deep link opens that
  // note directly (when it exists — a stale link falls back to browsing).
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialSelectedId && initialNotes.some((n) => n.id === initialSelectedId)
      ? initialSelectedId
      : null,
  );
  const [orgCollapsed, setOrgCollapsed] = useState(false);
  // Mobile drill-down level: 0 = folders, 1 = note list, 2 = editor. Ignored on
  // desktop; drives the slide on small screens. Deep links land on the editor.
  const [mobileLevel, setMobileLevel] = useState(selectedId ? 2 : 0);
  // Resizable side-pane widths (desktop), persisted across reloads.
  const [orgWidth, setOrgWidth] = useState(200);
  const [listWidth, setListWidth] = useState(280);
  const undo = useUndoToast();
  const creating = useRef(false);

  useEffect(() => {
    const o = Number(localStorage.getItem("notes:orgW"));
    const l = Number(localStorage.getItem("notes:listW"));
    if (o) setOrgWidth(o);
    if (l) setListWidth(l);
  }, []);

  function resizeOrg(next: number) {
    setOrgWidth(next);
    localStorage.setItem("notes:orgW", String(next));
  }
  function resizeList(next: number) {
    setListWidth(next);
    localStorage.setItem("notes:listW", String(next));
  }

  /** Mirror the open note into the URL so deep links survive reloads. */
  function syncUrl(id: string | null) {
    try {
      window.history.replaceState(
        window.history.state,
        "",
        id ? `/notes?note=${id}` : "/notes",
      );
    } catch {
      /* history unavailable — selection still works in-app */
    }
  }

  const visible = useMemo(
    () => sortNotes(notes.filter((n) => inFolder(n, folder))),
    [notes, folder],
  );
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  // Project name lookup for the editor's folder label.
  const projectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of folderGroups)
      for (const p of g.projects) map.set(p.id, p.name);
    return map;
  }, [folderGroups]);

  const counts = useMemo(
    () => ({
      all: notes.length,
      inbox: notes.filter((n) => n.project_id === null).length,
      pinned: notes.filter((n) => n.pinned).length,
    }),
    [notes],
  );

  // Move destinations: Inbox (unfiled) + every project, flattened.
  const moveTargets = useMemo<MoveTarget[]>(() => {
    const list: MoveTarget[] = [
      { id: null, name: "Inbox (unfiled)", color: null },
    ];
    for (const g of folderGroups)
      for (const p of g.projects)
        list.push({ id: p.id, name: p.name, color: p.color });
    return list;
  }, [folderGroups]);

  function selectFolder(next: Folder) {
    setFolder(next);
    setSelectedId(null); // back to browsing the new folder
    syncUrl(null);
    setMobileLevel(1); // folders -> note list
  }

  function selectNote(id: string) {
    setSelectedId(id);
    syncUrl(id);
    setMobileLevel(2); // note list -> editor
  }

  /** Close the note: desktop returns to the wide gallery, mobile slides back. */
  function closeNote() {
    setSelectedId(null);
    syncUrl(null);
    setMobileLevel(1);
  }

  // Esc closes the open note — but never while typing in the editor itself.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || !selectedId) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".note-editor")) return;
      closeNote();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleNewNote(projectId: string | null) {
    if (creating.current) return; // guard against double-create on fast taps
    creating.current = true;
    try {
      const note = await createBlankNoteAction(projectId);
      setNotes((prev) => [note, ...prev]);
      selectNote(note.id); // straight into the editor
    } finally {
      creating.current = false;
    }
  }

  async function handleSave(
    id: string,
    patch: { title: string | null; body: string },
  ) {
    const { updated_at } = await saveNoteAction(id, patch);
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, title: patch.title, body: patch.body, updated_at }
          : n,
      ),
    );
  }

  async function handleTogglePin(id: string, pinned: boolean) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned } : n)));
    await setPinAction(id, pinned);
  }

  function applyMove(id: string, projectId: string | null) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, project_id: projectId } : n)),
    );
    void moveNoteAction(id, projectId);
  }

  async function handleMove(id: string, projectId: string | null) {
    const prevProjectId = notes.find((n) => n.id === id)?.project_id ?? null;
    if (prevProjectId === projectId) return;
    applyMove(id, projectId);
    const destName =
      projectId === null ? "Inbox" : projectName.get(projectId) ?? "project";
    undo.show({
      msg: `Moved to ${destName}`,
      undo: () => applyMove(id, prevProjectId),
    });
  }

  function handleArchive(id: string) {
    const archived = notes.find((n) => n.id === id) ?? null;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) closeNote(); // archived the open note -> browse
    void archiveNoteWorkspaceAction(id); // fire; the toast shows immediately
    undo.show({
      msg: "Note archived",
      undo: archived
        ? () => {
            setNotes((prev) => sortNotes([archived, ...prev]));
            selectNote(archived.id);
            void unarchiveNoteWorkspaceAction(archived.id);
          }
        : undefined,
    });
  }

  const editorFolderLabel = selected
    ? selected.project_id
      ? projectName.get(selected.project_id) ?? "Project"
      : "Inbox"
    : "";

  return (
    <>
      <div
        className={
          "notes-workspace" +
          (orgCollapsed ? " org-collapsed" : "") +
          (selected ? "" : " is-browsing")
        }
        data-level={mobileLevel}
        style={
          {
            "--level": mobileLevel,
            "--org-w": `${orgWidth}px`,
            "--list-w": `${listWidth}px`,
          } as React.CSSProperties
        }
      >
        <OrgPane
          groups={folderGroups}
          folder={folder}
          allCount={counts.all}
          inboxCount={counts.inbox}
          pinnedCount={counts.pinned}
          onSelect={selectFolder}
          onCollapse={() => setOrgCollapsed(true)}
        />

        {!orgCollapsed ? (
          <PaneResizer
            width={orgWidth}
            min={170}
            max={340}
            onResize={resizeOrg}
            ariaLabel="Resize folders pane"
          />
        ) : null}

        <NoteList
          notes={visible}
          folder={folder}
          folderGroups={folderGroups}
          selectedId={selectedId}
          title={folderTitle(folder)}
          orgCollapsed={orgCollapsed}
          moveTargets={moveTargets}
          onSelect={selectNote}
          onNewNote={handleNewNote}
          onTogglePin={handleTogglePin}
          onArchive={handleArchive}
          onMove={handleMove}
          onExpandOrg={() => setOrgCollapsed(false)}
          onBack={() => setMobileLevel(0)}
        />

        {selected ? (
          <PaneResizer
            width={listWidth}
            min={230}
            max={460}
            onResize={resizeList}
            ariaLabel="Resize note list pane"
          />
        ) : null}

        <section className="notes-editor">
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              folderLabel={editorFolderLabel}
              onSave={handleSave}
              onTogglePin={handleTogglePin}
              onArchive={handleArchive}
              onBack={closeNote}
              moveTargets={moveTargets}
              onMove={handleMove}
            />
          ) : null}
        </section>
      </div>
      <UndoToast toast={undo.toast} onClear={undo.clear} />
    </>
  );
}
