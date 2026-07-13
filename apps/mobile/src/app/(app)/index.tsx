import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_NAME } from "@/lib/branding";
import { useAuth } from "@/lib/auth-context";
import { useCapture } from "@/lib/use-capture";
import { useVoice } from "@/lib/use-voice";
import { useReceipt } from "@/lib/use-receipt";
import { ReceiptSheet } from "@/components/receipt-sheet";

const PLACEHOLDER = "#9ca3af";
const STATUS_ROW =
  "flex-row items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3";

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Capture() {
  const { signOut } = useAuth();
  const { busy, feedback, send, reFile, reset } = useCapture();
  const [text, setText] = useState("");
  const [changing, setChanging] = useState(false);
  const voice = useVoice((t) =>
    setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t)),
  );
  const receipt = useReceipt();
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Close the sheet once a receipt saves; the banner below reports where.
  useEffect(() => {
    if (receipt.savedTo) setReceiptOpen(false);
  }, [receipt.savedTo]);

  async function onSend() {
    const t = text;
    setText("");
    setChanging(false);
    await send(t);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 pt-2 pb-1 h-11">
          <Text className="text-lg text-fg">{APP_NAME}</Text>
          <Pressable onPress={signOut} className="h-11 justify-center">
            <Text className="text-fg-muted">Sign out</Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pt-2 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          {receipt.savedTo && (
            <View className={STATUS_ROW}>
              <Text className="text-fg">Receipt saved to {receipt.savedTo}.</Text>
            </View>
          )}

          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (feedback.kind !== "idle") reset();
              if (receipt.savedTo) receipt.clearSavedTo();
            }}
            placeholder="Capture a thought…"
            placeholderTextColor={PLACEHOLDER}
            multiline
            autoFocus
            className="min-h-[120px] rounded-lg border border-border bg-surface px-4 py-3 text-base text-fg"
            style={{ textAlignVertical: "top" }}
          />

          {voice.phase === "recording" ? (
            <View className="h-14 flex-row items-center justify-between rounded-lg border border-border bg-surface px-4">
              <View className="flex-row items-center gap-2">
                <View className="h-2.5 w-2.5 rounded-full bg-prio-a-fg" />
                <Text className="text-fg">{fmtElapsed(voice.elapsedMs)}</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable onPress={voice.cancel} className="h-11 justify-center px-2">
                  <Text className="text-fg-muted">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={voice.stop}
                  className="h-11 items-center justify-center rounded bg-accent px-4"
                >
                  <Text className="font-medium text-accent-fg">Stop</Text>
                </Pressable>
              </View>
            </View>
          ) : voice.phase === "uploading" ? (
            <View className={STATUS_ROW}>
              <ActivityIndicator />
              <Text className="text-fg-muted">Transcribing…</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={voice.start}
                accessibilityLabel="Record a voice note"
                className="h-11 w-12 items-center justify-center rounded border border-border"
              >
                <Text className="text-lg">🎙</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  receipt.reset();
                  receipt.clearSavedTo();
                  setReceiptOpen(true);
                }}
                accessibilityLabel="Add a receipt photo"
                className="h-11 w-12 items-center justify-center rounded border border-border"
              >
                <Text className="text-lg">📷</Text>
              </Pressable>
              <Pressable
                disabled={busy || !text.trim()}
                onPress={onSend}
                className={`h-11 flex-1 flex-row items-center justify-center rounded px-4 ${
                  busy || !text.trim() ? "bg-surface-3" : "bg-accent"
                }`}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text
                    className={
                      text.trim() ? "font-medium text-accent-fg" : "text-fg-muted"
                    }
                  >
                    Capture
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {voice.error && (
            <View className={STATUS_ROW}>
              <Text className="text-danger">{voice.error}</Text>
            </View>
          )}

          <FeedbackCard
            feedback={feedback}
            changing={changing}
            onToggleChange={() => setChanging((c) => !c)}
            onPick={async (projectId) => {
              setChanging(false);
              await reFile(projectId);
            }}
          />
        </ScrollView>

        <ReceiptSheet
          receipt={receipt}
          visible={receiptOpen}
          onClose={() => setReceiptOpen(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
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

