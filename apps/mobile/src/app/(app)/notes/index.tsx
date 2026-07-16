import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import type { Note } from "@second-brain/shared/db/notes";
import { Text } from "@/components/ui/text";
import { TextInput } from "@/components/ui/text-input";
import { ScreenShell } from "@/components/screen-shell";
import { useNotes } from "@/lib/use-notes";
import { noteTitle } from "@/lib/note-format";

/** A folder / nav row: leading dot, label, trailing count. */
function FolderRow({
  label,
  count,
  color,
  onPress,
}: {
  label: string;
  count?: number;
  color?: string | null;
  onPress: () => void;
}) {
  const dot = color !== undefined ? resolveProjectColor(color) : undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="h-11 flex-row items-center gap-2.5 rounded-md px-2"
    >
      <View
        className="h-1.5 w-1.5 rounded-full bg-fg-muted"
        style={dot ? { backgroundColor: dot } : undefined}
      />
      <Text className="flex-1 text-[15px] text-fg" numberOfLines={1}>
        {label}
      </Text>
      {count != null && count > 0 ? (
        <Text className="text-[13px] text-fg-muted">{count}</Text>
      ) : null}
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1 mt-4 px-2 text-[11px] font-medium uppercase tracking-[1px] text-fg-muted">
      {children}
    </Text>
  );
}

/**
 * Notes home (drill-down level 1): a search hero, pinned notes, and folders
 * (All / Inbox / projects-by-area with color dots + counts / Archived). Tapping
 * a folder pushes the note-list grid; tapping a pinned note or a search hit
 * opens the editor.
 */
export default function NotesHomeScreen() {
  const data = useNotes();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Note[] | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      seq.current += 1;
      setHits(null);
      return;
    }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await data.search(q);
        if (seq.current === mySeq) setHits(res);
      } catch {
        if (seq.current === mySeq) setHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, data]);

  const openNote = (id: string) =>
    router.push({ pathname: "/notes/[id]", params: { id } });
  const openFolder = (params: Record<string, string>) =>
    router.push({ pathname: "/notes/list", params });

  const pinned = data.notes.filter((n) => n.pinned);

  return (
    <ScreenShell title="Notes">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-3 pb-6"
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={data.refresh}
          />
        }
      >
        <View className="mt-1 flex-row items-center rounded-lg border border-border bg-surface px-3">
          <TextInput
            className="h-11 flex-1 text-[15px] text-fg"
            placeholder="Search notes…"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityLabel="Clear search"
              className="h-11 w-8 items-center justify-center"
            >
              <Text className="text-fg-muted">✕</Text>
            </Pressable>
          ) : null}
        </View>

        {hits !== null ? (
          hits.length === 0 ? (
            <Text className="mt-6 px-2 text-[15px] text-fg-muted">
              No notes match “{query.trim()}”.
            </Text>
          ) : (
            <View className="mt-2">
              {hits.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => openNote(n.id)}
                  className="h-11 justify-center rounded-md px-2"
                >
                  <Text className="text-[15px] text-fg" numberOfLines={1}>
                    {noteTitle(n)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          <>
            {pinned.length > 0 ? (
              <>
                <SectionLabel>Pinned</SectionLabel>
                {pinned.map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => openNote(n.id)}
                    className="h-11 flex-row items-center gap-2.5 rounded-md px-2"
                  >
                    <Text className="text-fg-muted">★</Text>
                    <Text
                      className="flex-1 text-[15px] text-fg"
                      numberOfLines={1}
                    >
                      {noteTitle(n)}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            <SectionLabel>Folders</SectionLabel>
            <FolderRow
              label="All Notes"
              count={data.counts.all}
              onPress={() => openFolder({ kind: "all", name: "All Notes" })}
            />
            <FolderRow
              label="Inbox"
              count={data.counts.inbox}
              onPress={() => openFolder({ kind: "inbox", name: "Inbox" })}
            />

            {data.folderGroups.map((group) => (
              <View key={group.label}>
                <SectionLabel>{group.label}</SectionLabel>
                {group.projects.map((p) => (
                  <FolderRow
                    key={p.id}
                    label={p.name}
                    color={p.color}
                    count={data.projectCounts.get(p.id)}
                    onPress={() =>
                      openFolder({
                        kind: "project",
                        id: p.id,
                        name: p.name,
                        color: p.color ?? "",
                      })
                    }
                  />
                ))}
              </View>
            ))}

            <View className="mt-4">
              <FolderRow
                label="Archived"
                onPress={() =>
                  openFolder({ kind: "archived", name: "Archived" })
                }
              />
            </View>
          </>
        )}
      </ScrollView>
    </ScreenShell>
  );
}
