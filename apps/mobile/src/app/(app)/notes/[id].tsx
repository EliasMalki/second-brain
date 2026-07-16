import { useRef, useState } from "react";
import { Pressable, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Text } from "@/components/ui/text";
import { BackHeader } from "@/components/back-header";
import NoteEditorDom from "@/components/note-editor-dom";
import type { EditorCommand } from "@second-brain/editor/core";

/**
 * S2 SPIKE — proves the shared CodeMirror editor bundles and renders inside an
 * Expo DOM component (WebView), with tokens applied and the bridge callbacks
 * firing. Not the real editor screen yet (that's S5: real note load + autosave).
 * The on-screen readout (last emitted length, focus, checkbox) lets a
 * screenshot confirm the RN↔WebView round-trip.
 */
const SPIKE_DOC = `# Hello Notes

Live-preview markdown, shared with web. **Bold**, *italic*, ~~strike~~.

- [ ] a task to toggle
- [x] a done task
- a bullet

> A quiet blockquote.`;

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [readout, setReadout] = useState("(no edits yet)");
  const [command, setCommand] = useState<{ cmd: EditorCommand; seq: number }>();
  const seq = useRef(0);

  const run = (cmd: EditorCommand) =>
    setCommand({ cmd, seq: ++seq.current });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <BackHeader title="Editor spike" />

      <View className="flex-1">
        <NoteEditorDom
          doc={SPIKE_DOC}
          scheme={scheme}
          placeholder="Start writing…"
          command={command}
          onDocChanged={async (doc) =>
            setReadout(`docChanged · ${doc.length} chars`)
          }
          onCheckboxToggle={async (info) =>
            setReadout(`checkbox line ${info.lineNumber} → ${info.checked}`)
          }
          onFocusChange={async (focused) =>
            setReadout(focused ? "focused" : "blurred")
          }
          dom={{
            scrollEnabled: false,
            hideKeyboardAccessoryView: true,
            style: { flex: 1 },
          }}
        />
      </View>

      {/* temporary command probes (real accessory bar lands in S6) */}
      <View className="flex-row gap-2 border-t border-border px-4 py-2">
        {(["bold", "italic", "task", "bullet-list"] as EditorCommand[]).map(
          (c) => (
            <Pressable
              key={c}
              onPress={() => run(c)}
              className="h-9 items-center justify-center rounded-md border border-border bg-surface px-3"
            >
              <Text className="text-xs text-fg">{c}</Text>
            </Pressable>
          ),
        )}
      </View>
      <View className="px-4 pb-2">
        <Text className="text-xs text-fg-muted">
          {scheme} · id {id} · {readout}
        </Text>
      </View>
    </SafeAreaView>
  );
}
