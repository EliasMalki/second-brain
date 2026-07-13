import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { useReceipt } from "@/lib/use-receipt";

const PLACEHOLDER = "#9ca3af";
const INPUT =
  "h-11 rounded border border-border bg-surface px-3 text-fg";

export function ReceiptSheet({
  receipt,
  visible,
  onClose,
}: {
  receipt: ReturnType<typeof useReceipt>;
  visible: boolean;
  onClose: () => void;
}) {
  const {
    phase,
    error,
    imageUri,
    form,
    setForm,
    readable,
    projects,
    projectId,
    setProjectId,
    pick,
    save,
  } = receipt;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
        <View className="h-11 flex-row items-center justify-between px-6">
          <Text className="text-lg text-fg">Receipt</Text>
          <Pressable onPress={onClose} className="h-11 justify-center">
            <Text className="text-fg-muted">Cancel</Text>
          </Pressable>
        </View>

        {phase === "scanning" ? (
          <Centered>
            <ActivityIndicator />
            <Text className="text-fg-muted">Reading the receipt…</Text>
          </Centered>
        ) : phase === "saving" ? (
          <Centered>
            <ActivityIndicator />
            <Text className="text-fg-muted">Saving…</Text>
          </Centered>
        ) : phase === "confirm" ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-6 pt-2 gap-3 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                className="h-40 w-full rounded-lg"
                resizeMode="contain"
              />
            )}
            {!readable && (
              <Text className="text-fg-muted">
                Couldn&apos;t read it clearly — enter the details below.
              </Text>
            )}

            <Field label="Amount">
              <TextInput
                value={form.amount}
                onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                placeholder="0.00"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="decimal-pad"
                className={INPUT}
              />
            </Field>
            <Field label="Currency">
              <TextInput
                value={form.currency}
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, currency: v.toUpperCase() }))
                }
                autoCapitalize="characters"
                maxLength={3}
                className={INPUT}
              />
            </Field>
            <Field label="Vendor">
              <TextInput
                value={form.vendor}
                onChangeText={(v) => setForm((f) => ({ ...f, vendor: v }))}
                placeholder="Where from"
                placeholderTextColor={PLACEHOLDER}
                className={INPUT}
              />
            </Field>
            <Field label="Date">
              <TextInput
                value={form.purchasedOn}
                onChangeText={(v) => setForm((f) => ({ ...f, purchasedOn: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={PLACEHOLDER}
                className={INPUT}
              />
            </Field>
            <Field label="Note">
              <TextInput
                value={form.note}
                onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
                placeholder="Optional"
                placeholderTextColor={PLACEHOLDER}
                className={INPUT}
              />
            </Field>

            <Text className="pt-1 text-fg-secondary">File under</Text>
            {projects.length === 0 ? (
              <Text className="text-fg-muted">
                No projects yet — create one on the web to file receipts.
              </Text>
            ) : (
              <View className="gap-1">
                {projects.map((p) => {
                  const selected = p.id === projectId;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setProjectId(p.id)}
                      className={`h-11 flex-row items-center justify-between rounded px-3 ${
                        selected ? "bg-surface-3" : ""
                      }`}
                    >
                      <Text className="text-fg">{p.name}</Text>
                      {selected && <Text className="text-fg">✓</Text>}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {error && <Text className="text-danger">{error}</Text>}

            <Pressable
              onPress={save}
              disabled={!projectId || !form.amount.trim()}
              className={`mt-2 h-11 items-center justify-center rounded px-4 ${
                !projectId || !form.amount.trim() ? "bg-surface-3" : "bg-accent"
              }`}
            >
              <Text
                className={
                  !projectId || !form.amount.trim()
                    ? "text-fg-muted"
                    : "font-medium text-accent-fg"
                }
              >
                Save receipt
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          // idle → source chooser
          <View className="gap-3 px-6 pt-4">
            <Text className="text-fg-muted">Add a receipt photo.</Text>
            <Pressable
              onPress={() => pick("camera")}
              className="h-11 items-center justify-center rounded bg-accent px-4"
            >
              <Text className="font-medium text-accent-fg">Take photo</Text>
            </Pressable>
            <Pressable
              onPress={() => pick("library")}
              className="h-11 items-center justify-center rounded border border-border px-4"
            >
              <Text className="text-fg">Choose from library</Text>
            </Pressable>
            {error && <Text className="text-danger">{error}</Text>}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Centered({ children }: { children: ViewProps["children"] }) {
  return (
    <View className="flex-1 items-center justify-center gap-3">{children}</View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ViewProps["children"];
}) {
  return (
    <View className="gap-1">
      <Text className="text-fg-secondary">{label}</Text>
      {children}
    </View>
  );
}
