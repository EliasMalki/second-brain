"use client";

import { useMemo, useState } from "react";
import type { Note } from "@/lib/db/notes";
import { OrgPane } from "./org-pane";
import { NoteList } from "./note-list";
import { NoteEditor } from "./note-editor";
import {
  archiveNoteWorkspaceAction,
  createBlankNoteAction,
  saveNoteAction,
  setPinAction,
} from "./actions";
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

  function pickAfter(list: Note[], folderFor: Folder): string | null {
    return sortNotes(list.filter((n) => inFolder(n, folderFor)))[0]?.id ?? null;
  }

  function selectFolder(next: Folder) {
    setFolder(next);
    setSelectedId(pickAfter(notes, next));
  }

  async function handleNewNote() {
    const targetFolder: Folder =
      folder.kind === "project" ? folder : { kind: "all" };
    const projectId = folder.kind === "project" ? folder.id : null;
    const note = await createBlankNoteAction(projectId);
    setNotes((prev) => [note, ...prev]);
    setFolder(targetFolder);
    setSelectedId(note.id);
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

  async function handleArchive(id: string) {
    const remaining = notes.filter((n) => n.id !== id);
    setNotes(remaining);
    if (selectedId === id) setSelectedId(pickAfter(remaining, folder));
    await archiveNoteWorkspaceAction(id);
  }

  const editorFolderLabel = selected
    ? selected.project_id
      ? projectName.get(selected.project_id) ?? "Project"
      : "Inbox"
    : "";

  return (
    <div className={"notes-workspace" + (orgCollapsed ? " org-collapsed" : "")}>
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
        onSelect={setSelectedId}
        onNewNote={handleNewNote}
        onToggleOrg={() => setOrgCollapsed((c) => !c)}
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
