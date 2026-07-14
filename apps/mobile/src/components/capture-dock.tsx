import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { TextInput } from "@/components/ui/text-input";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { useCapture } from "@/lib/use-capture";
import { useCaptureDock } from "@/lib/capture-dock-context";
import { ReceiptSheet } from "./receipt-sheet";

const STATUS_ROW =
  "flex-row items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3";

// web .composer lift shadow, approximated to one native shadow layer
const LIFT = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 6 },
  },
  default: { elevation: 6 },
});

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The persistent bottom capture composer — web's docked `.composer`, one to
 * one: auto-growing input with a trailing 32px button that swaps text→send /
 * empty→mic, plus a camera button (a deliberate mobile divergence: receipt
 * scanning has no other surface here). Recording replaces the row with web's
 * recording-bar (dot · timer · cancel · confirm). Filing feedback, voice
 * errors and the receipt-saved banner render ABOVE the composer, matching
 * web's `extras` slot. Owns the bottom safe-area inset; rendered in-flow at
 * the bottom of every screen by ScreenShell (never overlaid by content).
 */
export function CaptureDockBar() {
  const { capture, voice, receipt, text, setText, receiptOpen, setReceiptOpen } =
    useCaptureDock();
  const insets = useSafeAreaInsets();
  const [changing, setChanging] = useState(false);

  const hasText = text.trim().length > 0;

  function onChangeText(t: string) {
    setText(t);
    if (capture.feedback.kind !== "idle") capture.reset();
    if (receipt.savedTo) receipt.clearSavedTo();
  }

  async function onSend() {
    if (!hasText || capture.busy) return;
    const t = text;
    setText("");
    setChanging(false);
    await capture.send(t);
  }

  function onOpenReceipt() {
    receipt.reset();
    receipt.clearSavedTo();
    setReceiptOpen(true);
  }

  return (
    <View
      className="gap-2 px-4 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {/* extras — status surfaces above the composer, like web */}
      {receipt.savedTo ? (
        <View className={STATUS_ROW}>
          <Text className="text-fg">Receipt saved to {receipt.savedTo}.</Text>
        </View>
      ) : null}
      {voice.error ? (
        <View className={STATUS_ROW}>
          <Text className="flex-1 text-danger">{voice.error}</Text>
          <Pressable onPress={voice.clearError} hitSlop={8}>
            <Text className="text-fg-muted">Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
      <FeedbackCard
        feedback={capture.feedback}
        changing={changing}
        onToggleChange={() => setChanging((c) => !c)}
        onPick={async (projectId) => {
          setChanging(false);
          await capture.reFile(projectId);
        }}
      />

      <View
        className="rounded-[20px] border border-border-2 bg-surface"
        style={LIFT}
      >
        {voice.phase === "recording" ? (
          <View className="h-[52px] flex-row items-center gap-2 py-2 pl-4 pr-2">
            <View className="h-2.5 w-2.5 rounded-full bg-danger" />
            <Text className="text-fg" style={{ fontVariant: ["tabular-nums"] }}>
              {fmtElapsed(voice.elapsedMs)}
            </Text>
            <Text className="flex-1 text-fg-muted">Recording…</Text>
            <Pressable
              onPress={voice.cancel}
              accessibilityLabel="Cancel recording"
              className="h-11 w-11 items-center justify-center"
            >
              <Text className="text-base text-fg-secondary">✕</Text>
            </Pressable>
            <Pressable
              onPress={voice.stop}
              accessibilityLabel="Stop recording"
              className="h-8 w-8 items-center justify-center rounded-full bg-accent"
            >
              <Text className="text-base font-medium text-accent-fg">✓</Text>
            </Pressable>
          </View>
        ) : voice.phase === "uploading" ? (
          <View className="h-[52px] flex-row items-center gap-2 py-2 pl-4 pr-2">
            <ActivityIndicator size="small" />
            <Text className="text-fg-muted">Transcribing…</Text>
          </View>
        ) : (
          <View className="flex-row items-end gap-1 p-2 pl-4">
            <TextInput
              value={text}
              onChangeText={onChangeText}
              placeholder="Capture a thought, task, or note…"
              multiline
              className="max-h-32 flex-1 py-1.5 text-base text-fg"
              style={{ textAlignVertical: "top" }}
            />
            <Pressable
              onPress={onOpenReceipt}
              accessibilityLabel="Add a receipt photo"
              className="h-8 w-8 items-center justify-center rounded-full"
            >
              {/* camera glyph drawn with views — no icon library */}
              <View className="h-4 w-5 items-center justify-center rounded-[4px] border-[1.5px] border-fg-secondary">
                <View className="h-1.5 w-1.5 rounded-full border-[1.5px] border-fg-secondary" />
              </View>
            </Pressable>
            {hasText ? (
              <Pressable
                onPress={onSend}
                disabled={capture.busy}
                accessibilityLabel="Capture"
                className="h-8 w-8 items-center justify-center rounded-full bg-accent"
              >
                {capture.busy ? (
                  <ActivityIndicator size="small" className="text-accent-fg" />
                ) : (
                  <Text className="text-base font-medium text-accent-fg">↑</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void voice.start()}
                accessibilityLabel="Record a voice note"
                className="h-8 w-8 items-center justify-center rounded-full"
              >
                {/* mic glyph drawn with views */}
                <View className="items-center gap-[2px]">
                  <View className="h-3 w-[7px] rounded-full border-[1.5px] border-fg-secondary" />
                  <View className="h-[1.5px] w-3 rounded-full bg-fg-secondary" />
                </View>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <ReceiptSheet
        receipt={receipt}
        visible={receiptOpen}
        onClose={() => setReceiptOpen(false)}
      />
    </View>
  );
}

function FeedbackCard({
  feedback,
  changing,
  onToggleChange,
  onPick,
}: {
  feedback: ReturnType<typeof useCapture>["feedback"];
  changing: boolean;
  onToggleChange: () => void;
  onPick: (projectId: string) => void;
}) {
  if (feedback.kind === "idle") return null;

  if (feedback.kind === "filing") {
    return (
      <View className={STATUS_ROW}>
        <ActivityIndicator />
        <Text className="text-fg-muted">Filing…</Text>
      </View>
    );
  }
  if (feedback.kind === "offline") {
    return (
      <View className={STATUS_ROW}>
        <Text className="text-fg">Saved — will sync when you&apos;re back online.</Text>
      </View>
    );
  }
  if (feedback.kind === "inbox") {
    return (
      <View className={STATUS_ROW}>
        <Text className="text-fg">Saved to your Inbox.</Text>
      </View>
    );
  }
  if (feedback.kind === "error") {
    return (
      <View className={STATUS_ROW}>
        <Text className="text-danger">{feedback.message}</Text>
      </View>
    );
  }

  // filed
  const { outcome } = feedback;
  const filedLabel = outcome.projectName
    ? `Filed to ${outcome.projectName}`
    : "In your Inbox";
  return (
    <View className="gap-2 rounded-lg border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-fg">{filedLabel}</Text>
        <Pressable onPress={onToggleChange} className="h-11 justify-center">
          <Text className="text-fg-muted">
            {outcome.projectName ? "Change" : "File it"}
          </Text>
        </Pressable>
      </View>
      {changing && (
        <View className="gap-1 border-t border-border pt-2">
          {outcome.projects.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => onPick(p.id)}
              className="h-11 justify-center"
            >
              <Text className="text-fg">{p.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
