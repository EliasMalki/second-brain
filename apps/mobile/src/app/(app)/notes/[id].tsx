import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { getNote, updateNote } from "@second-brain/shared/db/notes";
import {
  createAutosaveController,
  type AutosaveController,
  type SaveState,
} from "@second-brain/editor/save";
import { Text } from "@/components/ui/text";
import { TextInput } from "@/components/ui/text-input";
import { BackHeader } from "@/components/back-header";
import NoteEditorDom from "@/components/note-editor-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { noteDrafts } from "@/lib/note-drafts";

const STATUS_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Saving…",
  saving: "Saving…",
  error: "Retrying…",
  offline: "Offline",
};

type Loaded = {
  title: string;
  body: string;
  serverTitle: string | null;
  serverBody: string;
  restored: boolean;
};

/**
 * The note (drill-down level 3): the shared editor in a DOM component +
 * RN-side autosave. Loads the row (restoring a newer local draft if present),
 * then mounts the mount-once editor with that markdown. onDocChanged feeds the
 * autosave controller (created per-mount, StrictMode-safe); saves go direct via
 * updateNote (which keeps body_text in sync). Flushes on blur, app-background,
 * and unmount — the save runs on RN so it completes even as the webview tears
 * down. Full-screen: back chevron, no capture dock (the editor owns the keyboard).
 */
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId } = useAuth();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<SaveState | null>(null);

  const controllerRef = useRef<AutosaveController | null>(null);
  const lastBody = useRef("");
  const latestTitle = useRef("");
  latestTitle.current = title;

  // Load the note (+ restore a newer local draft).
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!orgId || !id) return;
      const note = await getNote(supabase, orgId, id);
      if (!note || !alive) return;
      const draft = await noteDrafts.get(id);
      const restore =
        draft != null &&
        draft.savedAt > note.updated_at &&
        (draft.body !== note.body ||
          (draft.title ?? null) !== (note.title ?? null));
      const next: Loaded = {
        title: (restore ? draft!.title : note.title) ?? "",
        body: restore ? draft!.body : note.body,
        serverTitle: note.title,
        serverBody: note.body,
        restored: !!restore,
      };
      if (!alive) return;
      setLoaded(next);
      setTitle(next.title);
      lastBody.current = next.body;
    })();
    return () => {
      alive = false;
    };
  }, [orgId, id]);

  // Autosave controller — created per-mount once the note is loaded.
  useEffect(() => {
    if (!loaded || !orgId || !id) return;
    const controller = createAutosaveController({
      save: async (doc) => {
        await updateNote(supabase, orgId, id, {
          title: doc.title,
          body: doc.body,
        });
      },
      initial: { title: loaded.serverTitle, body: loaded.serverBody },
      drafts: noteDrafts,
      noteId: id,
      onState: setStatus,
    });
    controllerRef.current = controller;
    if (loaded.restored)
      controller.noteEdited({
        title: loaded.title.trim() || null,
        body: loaded.body,
      });

    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") void controller.flush();
    });
    return () => {
      sub.remove();
      controllerRef.current = null;
      void controller.flush().finally(() => controller.dispose());
    };
  }, [loaded, orgId, id]);

  const edited = (nextTitle?: string) => {
    controllerRef.current?.noteEdited({
      title: (nextTitle ?? latestTitle.current).trim() || null,
      body: lastBody.current,
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <BackHeader
        title=""
        right={
          <Text className="text-[12px] text-fg-muted" accessibilityLiveRegion="polite">
            {status ? STATUS_LABEL[status] : ""}
          </Text>
        }
      />

      {!loaded ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#888" />
        </View>
      ) : (
        <View className="flex-1">
          <TextInput
            className="px-4 pb-1 text-[22px] font-semibold text-fg"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              edited(t);
            }}
            onBlur={() => void controllerRef.current?.flush()}
            placeholder="Title"
            returnKeyType="next"
          />
          <View className="flex-1">
            <NoteEditorDom
              doc={loaded.body}
              scheme={scheme}
              placeholder="Start writing…"
              onDocChanged={async (doc) => {
                lastBody.current = doc;
                edited();
              }}
              onCheckboxToggle={async () => {
                void Haptics.selectionAsync();
              }}
              onFocusChange={async (focused) => {
                if (!focused) void controllerRef.current?.flush();
              }}
              dom={{
                scrollEnabled: false,
                hideKeyboardAccessoryView: true,
                style: { flex: 1 },
              }}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
