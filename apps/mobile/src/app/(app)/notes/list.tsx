import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import type { Note } from "@second-brain/shared/db/notes";
import { Text } from "@/components/ui/text";
import { BackHeader } from "@/components/back-header";
import { NoteCard } from "@/components/note-card";
import { NoteActionsSheet } from "@/components/note-actions-sheet";
import { ProjectPickerSheet } from "@/components/project-picker-sheet";
import { useNotes } from "@/lib/use-notes";
import { noteTitle, notePreview } from "@/lib/note-format";

type FolderKind = "all" | "inbox" | "project" | "archived";
const VIEW_KEY = "notes:view";
type NotesView = "cards" | "list";

type Section = {
  key: string;
  label: string | null;
  color: string | null;
  count: number;
  /** undefined = no "+"; null = new note in Inbox; string = project id. */
  newTarget: string | null | undefined;
  notes: Note[];
};

/** Web's buildSections, mobile: Pinned first, then Inbox + per-project for the
 *  "All Notes" folder; a single Notes section for a specific folder. */
function buildSections(
  kind: FolderKind,
  projectId: string | undefined,
  notes: Note[],
  groups: { label: string; projects: { id: string; name: string; color: string | null }[] }[],
): Section[] {
  if (kind === "archived")
    return [
      { key: "arch", label: null, color: null, count: notes.length, newTarget: undefined, notes },
    ];

  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);
  const sections: Section[] = [];
  if (pinned.length > 0)
    sections.push({ key: "pinned", label: "Pinned", color: null, count: pinned.length, newTarget: undefined, notes: pinned });

  if (kind === "inbox" || kind === "project") {
    sections.push({
      key: "rest",
      label: pinned.length > 0 ? "Notes" : null,
      color: null,
      count: rest.length,
      newTarget: kind === "project" ? (projectId ?? null) : null,
      notes: rest,
    });
    return sections;
  }

  // "all": Inbox, then each project in group order.
  const inbox = rest.filter((n) => n.project_id === null);
  if (inbox.length > 0)
    sections.push({ key: "inbox", label: "Inbox", color: null, count: inbox.length, newTarget: null, notes: inbox });
  const byProject = new Map<string, Note[]>();
  for (const n of rest) {
    if (!n.project_id) continue;
    const list = byProject.get(n.project_id) ?? [];
    list.push(n);
    byProject.set(n.project_id, list);
  }
  for (const group of groups)
    for (const p of group.projects) {
      const list = byProject.get(p.id);
      if (!list) continue;
      byProject.delete(p.id);
      sections.push({ key: p.id, label: p.name, color: p.color, count: list.length, newTarget: p.id, notes: list });
    }
  return sections;
}

type Cell = { kind: "ghost"; target: string | null } | { kind: "note"; note: Note };
type Row =
  | { type: "header"; section: Section }
  | { type: "cards"; key: string; cells: Cell[] }
  | { type: "row"; note: Note }
  | { type: "ghost-row"; target: string | null };

function toRows(
  sections: Section[],
  view: NotesView,
  showGhost: boolean,
  ghostTarget: string | null,
): Row[] {
  const rows: Row[] = [];
  sections.forEach((section, si) => {
    if (section.label) rows.push({ type: "header", section });
    const cells: Cell[] = [];
    if (si === 0 && showGhost) cells.push({ kind: "ghost", target: ghostTarget });
    for (const n of section.notes) cells.push({ kind: "note", note: n });

    if (view === "cards") {
      for (let i = 0; i < cells.length; i += 2)
        rows.push({ type: "cards", key: `${section.key}-${i}`, cells: cells.slice(i, i + 2) });
    } else {
      for (const c of cells)
        rows.push(
          c.kind === "ghost"
            ? { type: "ghost-row", target: c.target }
            : { type: "row", note: c.note },
        );
    }
  });
  return rows;
}

/** Note list (drill-down level 2): a 2-column card grid (or compact list) of
 *  the selected folder, Pinned first, sections with quiet dots + counts, a
 *  dashed "New note" ghost card, and per-section "+". Full web parity. */
export default function NoteListScreen() {
  const params = useLocalSearchParams<{
    kind?: string;
    id?: string;
    name?: string;
    color?: string;
  }>();
  const kind = (params.kind ?? "all") as FolderKind;
  const projectId = params.id;
  const data = useNotes();

  const [view, setView] = useState<NotesView>("cards");
  useEffect(() => {
    void AsyncStorage.getItem(VIEW_KEY).then((v) => {
      if (v === "cards" || v === "list") setView(v);
    });
  }, []);
  const chooseView = (v: NotesView) => {
    setView(v);
    void AsyncStorage.setItem(VIEW_KEY, v);
  };

  // Archived notes are a separate on-demand fetch; other folders filter the
  // hook's loaded set.
  const [archived, setArchived] = useState<Note[]>([]);
  const reloadArchived = useCallback(() => {
    if (kind === "archived") void data.fetchArchived().then(setArchived);
  }, [kind, data]);
  useFocusEffect(reloadArchived);

  const folderNotes = useMemo(() => {
    if (kind === "archived") return archived;
    if (kind === "inbox") return data.notes.filter((n) => n.project_id === null);
    if (kind === "project")
      return data.notes.filter((n) => n.project_id === projectId);
    return data.notes;
  }, [kind, projectId, data.notes, archived]);

  const sections = useMemo(
    () => buildSections(kind, projectId, folderNotes, data.folderGroups),
    [kind, projectId, folderNotes, data.folderGroups],
  );

  const ghostTarget = kind === "project" ? (projectId ?? null) : null;
  const showGhost = kind !== "archived";
  const rows = useMemo(
    () => toRows(sections, view, showGhost, ghostTarget),
    [sections, view, showGhost, ghostTarget],
  );

  // Sheets.
  const [menuNote, setMenuNote] = useState<Note | null>(null);
  const [moveNote, setMoveNote] = useState<Note | null>(null);

  const openNote = (id: string) =>
    router.push({ pathname: "/notes/[id]", params: { id } });
  const createIn = async (target: string | null) => {
    const note = await data.create(target);
    openNote(note.id);
  };

  const moveTargets = useMemo(
    () => data.folderGroups.flatMap((g) => g.projects),
    [data.folderGroups],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === "header") {
        const dot = resolveProjectColor(item.section.color);
        return (
          <View className="mb-1.5 mt-4 flex-row items-center gap-1.5 px-1">
            <View
              className="h-1.5 w-1.5 rounded-full bg-fg-muted"
              style={dot ? { backgroundColor: dot } : undefined}
            />
            <Text className="text-[11px] font-medium uppercase tracking-[1px] text-fg-muted">
              {item.section.label}
            </Text>
            <Text className="text-[11px] text-fg-muted">{item.section.count}</Text>
            {item.section.newTarget !== undefined ? (
              <Pressable
                onPress={() => void createIn(item.section.newTarget as string | null)}
                hitSlop={8}
                accessibilityLabel={`New note in ${item.section.label}`}
                className="ml-auto h-6 w-6 items-center justify-center"
              >
                <Text className="text-[16px] text-fg-muted">+</Text>
              </Pressable>
            ) : null}
          </View>
        );
      }
      if (item.type === "ghost-row") {
        return (
          <Pressable
            onPress={() => void createIn(item.target)}
            className="mb-2 h-12 flex-row items-center justify-center rounded-xl border border-dashed border-border-2"
          >
            <Text className="text-[14px] text-fg-muted">+ New note</Text>
          </Pressable>
        );
      }
      if (item.type === "row") {
        const preview = notePreview(item.note, 1)[0]?.text ?? "";
        return (
          <Pressable
            onPress={() => openNote(item.note.id)}
            onLongPress={() => setMenuNote(item.note)}
            className="mb-1 gap-0.5 rounded-lg px-2 py-2"
          >
            <View className="flex-row items-center gap-1">
              {item.note.pinned ? (
                <Text className="text-[11px] text-fg-muted">★</Text>
              ) : null}
              <Text className="flex-1 text-[15px] text-fg" numberOfLines={1}>
                {noteTitle(item.note)}
              </Text>
            </View>
            {preview ? (
              <Text className="text-[13px] text-fg-muted" numberOfLines={1}>
                {preview}
              </Text>
            ) : null}
          </Pressable>
        );
      }
      // cards row (two cells)
      return (
        <View className="mb-2 flex-row gap-2">
          {item.cells.map((cell) =>
            cell.kind === "ghost" ? (
              <Pressable
                key="ghost"
                onPress={() => void createIn(cell.target)}
                className="min-h-[128px] flex-1 items-center justify-center rounded-xl border border-dashed border-border-2"
              >
                <Text className="text-[14px] text-fg-muted">+ New note</Text>
              </Pressable>
            ) : (
              <NoteCard
                key={cell.note.id}
                note={cell.note}
                onOpen={() => openNote(cell.note.id)}
                onMenu={() => setMenuNote(cell.note)}
              />
            ),
          )}
          {item.cells.length === 1 ? <View className="flex-1" /> : null}
        </View>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view],
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <BackHeader
        title={params.name ?? "Notes"}
        right={
          <View className="flex-row items-center gap-1">
            <View className="flex-row overflow-hidden rounded-md border border-border">
              <Pressable
                onPress={() => chooseView("cards")}
                className={`h-8 w-8 items-center justify-center ${view === "cards" ? "bg-surface-2" : ""}`}
                accessibilityLabel="Card view"
              >
                <Text className={view === "cards" ? "text-fg" : "text-fg-muted"}>▦</Text>
              </Pressable>
              <Pressable
                onPress={() => chooseView("list")}
                className={`h-8 w-8 items-center justify-center ${view === "list" ? "bg-surface-2" : ""}`}
                accessibilityLabel="List view"
              >
                <Text className={view === "list" ? "text-fg" : "text-fg-muted"}>≡</Text>
              </Pressable>
            </View>
            {kind !== "archived" ? (
              <Pressable
                onPress={() => void createIn(ghostTarget)}
                accessibilityLabel="New note"
                className="h-9 w-9 items-center justify-center"
              >
                <Text className="text-[20px] text-fg">+</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      <FlatList
        data={rows}
        keyExtractor={(r, i) =>
          r.type === "header"
            ? `h-${r.section.key}`
            : r.type === "cards"
              ? `c-${r.key}`
              : r.type === "row"
                ? `r-${r.note.id}`
                : `g-${i}`
        }
        renderItem={renderItem}
        contentContainerClassName="px-3 pb-10 pt-1"
        refreshing={data.refreshing}
        onRefresh={data.refresh}
        ListEmptyComponent={
          <Text className="mt-16 text-center text-fg-muted">
            {kind === "archived"
              ? "The archive is empty."
              : "Nothing here yet — a first thought is enough."}
          </Text>
        }
      />

      <NoteActionsSheet
        note={menuNote}
        onClose={() => setMenuNote(null)}
        onTogglePin={(n) => {
          data.togglePin(n.id, !n.pinned);
          setMenuNote(null);
        }}
        onMove={(n) => {
          setMenuNote(null);
          setMoveNote(n);
        }}
        onArchive={(n) => {
          if (n.archived) data.unarchive(n);
          else data.archive(n.id);
          setMenuNote(null);
        }}
      />

      <ProjectPickerSheet
        title={moveNote ? "Move to…" : null}
        projects={moveTargets}
        leading={
          moveNote
            ? {
                label: "Inbox / Unfiled",
                onPress: () => {
                  if (moveNote) data.move(moveNote.id, null);
                  setMoveNote(null);
                },
              }
            : undefined
        }
        onPick={(projectId) => {
          if (moveNote) data.move(moveNote.id, projectId);
          setMoveNote(null);
        }}
        onClose={() => setMoveNote(null)}
      />
    </SafeAreaView>
  );
}
