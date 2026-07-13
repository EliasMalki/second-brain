import { useState } from "react";
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

const PLACEHOLDER = "#9ca3af";
const STATUS_ROW =
  "flex-row items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3";

export default function Capture() {
  const { signOut } = useAuth();
  const { busy, feedback, send, reFile, reset } = useCapture();
  const [text, setText] = useState("");
  const [changing, setChanging] = useState(false);

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
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (feedback.kind !== "idle") reset();
            }}
            placeholder="Capture a thought…"
            placeholderTextColor={PLACEHOLDER}
            multiline
            autoFocus
            className="min-h-[120px] rounded-lg border border-border bg-surface px-4 py-3 text-base text-fg"
            style={{ textAlignVertical: "top" }}
          />

          <Pressable
            disabled={busy || !text.trim()}
            onPress={onSend}
            className={`h-11 flex-row items-center justify-center rounded px-4 ${
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

