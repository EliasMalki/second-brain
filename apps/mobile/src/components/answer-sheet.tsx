import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { TextInput } from "@/components/ui/text-input";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Answer sheet for an Inbox question prompt. Deliberately NOT optimistic — the
 * typed answer must survive a failed request, so the draft stays and an error
 * shows in place; the sheet only closes on a successful submit. `prompt` set =
 * open (carries the question text + prompt id via the caller).
 */
export function AnswerSheet({
  question,
  onSubmit,
  onClose,
}: {
  question: string | null;
  onSubmit: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the draft each time a new question opens.
  useEffect(() => {
    if (question != null) {
      setText("");
      setError(null);
      setBusy(false);
    }
  }, [question]);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(t);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't stick — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      transparent
      visible={question != null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable className="flex-1 bg-scrim" onPress={onClose} />
        <View
          style={{ paddingBottom: insets.bottom + 8 }}
          className="rounded-t-2xl border-t border-border bg-surface px-4 pt-2"
        >
          <View className="items-center py-2">
            <View className="h-1 w-9 rounded-full bg-border-2" />
          </View>
          <Text className="px-1 pb-2 text-fg" numberOfLines={3}>
            {question ?? ""}
          </Text>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (error) setError(null);
            }}
            placeholder="Type your answer…"
            multiline
            autoFocus
            className="min-h-[80px] rounded-lg border border-border bg-bg px-4 py-3 text-base text-fg"
            style={{ textAlignVertical: "top" }}
          />
          {error ? <Text className="pt-2 text-danger">{error}</Text> : null}
          <View className="flex-row items-center justify-end gap-3 pt-3">
            <Pressable onPress={onClose} className="h-11 justify-center px-3">
              <Text className="text-fg-muted">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={busy || !text.trim()}
              className={`h-11 items-center justify-center rounded-lg px-5 ${
                busy || !text.trim() ? "bg-surface-3" : "bg-accent"
              }`}
            >
              {busy ? (
                <ActivityIndicator className="text-accent-fg" />
              ) : (
                <Text
                  className={
                    text.trim() ? "font-medium text-accent-fg" : "text-fg-muted"
                  }
                >
                  Answer
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
