"use client";

import { useMemo, useState } from "react";
import type { Note } from "@/lib/db/notes";
import { OrgPane } from "./org-pane";
import { NoteList } from "./note-list";
import { NoteEditor } from "./note-editor";
import {
  archiveNoteWorkspaceAction,
  createBlankNoteAction,
  moveNoteAction,
  saveNoteAction,
  setPinAction,
} from "./actions";
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
 * The three-pane Notes view (Apple-Notes paradigm): org pane · note list ·
 * editor. Holds all selection state and a local copy of the notes seeded from
 * the server; mutations call server actions and patch local state so the UI
 * stays snappy without a full reload. The actions also revalidate /notes, so
 * other views (Inbox, project pages, search) stay correct.
 */
export function NotesWorkspace({
  initialNotes,
  folderGroups,
}: {
  initialNotes: Note[];
  folderGroups: FolderGroup[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [folder, setFolder] = useState<Folder>({ kind: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(
    () => sortNotes(initialNotes)[0]?.id ?? null,
  );
  const [orgCollapsed, setOrgCollapsed] = useState(false);
  // Mobile drill-down level: 0 = folders, 1 = note list, 2 = editor. Ignored on
  // desktop (all three panes are visible); drives the slide on small screens.
  const [mobileLevel, setMobileLevel] = useState(0);

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
    const list: MoveTarget[] = [{ id: null, name: "Inbox (unfiled)" }];
    for (const g of folderGroups)
      for (const p of g.projects) list.push({ id: p.id, name: p.name });
    return list;
  }, [folderGroups]);

  function pickAfter(list: Note[], folderFor: Folder): string | null {
    return sortNotes(list.filter((n) => inFolder(n, folderFor)))[0]?.id ?? null;
  }

  function selectFolder(next: Folder) {
    setFolder(next);
    setSelectedId(pickAfter(notes, next));
    setMobileLevel(1); // folders -> note list
  }

  function selectNote(id: string) {
    setSelectedId(id);
    setMobileLevel(2); // note list -> editor
  }

  async function handleNewNote() {
    const targetFolder: Folder =
      folder.kind === "project" ? folder : { kind: "all" };
    const projectId = folder.kind === "project" ? folder.id : null;
    const note = await createBlankNoteAction(projectId);
    setNotes((prev) => [note, ...prev]);
    setFolder(targetFolder);
    setSelectedId(note.id);
    setMobileLevel(2); // jump straight to the editor for the new note
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

  async function handleMove(id: string, projectId: string | null) {
    const updated = notes.map((n) =>
      n.id === id ? { ...n, project_id: projectId } : n,
    );
    setNotes(updated);
    // If the note just left the folder we're viewing, reselect within it.
    const moved = updated.find((n) => n.id === id);
    if (selectedId === id && moved && !inFolder(moved, folder)) {
      setSelectedId(pickAfter(updated, folder));
      setMobileLevel(1);
    }
    await moveNoteAction(id, projectId);
  }

  async function handleArchive(id: string) {
    const remaining = notes.filter((n) => n.id !== id);
    setNotes(remaining);
    if (selectedId === id) setSelectedId(pickAfter(remaining, folder));
    setMobileLevel(1); // archived -> back to the note list on mobile
    await archiveNoteWorkspaceAction(id);
  }

  const editorFolderLabel = selected
    ? selected.project_id
      ? projectName.get(selected.project_id) ?? "Project"
      : "Inbox"
    : "";

  return (
    <div
      className={"notes-workspace" + (orgCollapsed ? " org-collapsed" : "")}
      data-level={mobileLevel}
      style={{ "--level": mobileLevel } as React.CSSProperties}
    >
      <OrgPane
        groups={folderGroups}
        folder={folder}
        allCount={counts.all}
        inboxCount={counts.inbox}
        pinnedCount={counts.pinned}
        onSelect={selectFolder}
      />

      <NoteList
        notes={visible}
        selectedId={selectedId}
        title={folderTitle(folder)}
        orgCollapsed={orgCollapsed}
        onSelect={selectNote}
        onNewNote={handleNewNote}
        onToggleOrg={() => setOrgCollapsed((c) => !c)}
        onBack={() => setMobileLevel(0)}
      />

      <section className="notes-editor">
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            folderLabel={editorFolderLabel}
            onSave={handleSave}
            onTogglePin={handleTogglePin}
            onArchive={handleArchive}
            onBack={() => setMobileLevel(1)}
            moveTargets={moveTargets}
            onMove={handleMove}
          />
        ) : (
          <div className="note-editor-empty">
            <i className="ti ti-note" aria-hidden="true" />
            <p>Select a note, or start a new one.</p>
          </div>
        )}
      </section>
    </div>
  );
}
