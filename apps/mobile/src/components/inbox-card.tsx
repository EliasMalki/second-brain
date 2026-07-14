import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { InboxItem } from "@second-brain/shared/db/inbox";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import { fmtAgoFine } from "@second-brain/shared/domain/dates";
import { VOICE_FAILED_TAG } from "@second-brain/shared/domain/tags";
import type { ProjectMeta } from "@/lib/use-today";

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Card body preview: note title|body, task title, or prompt text. */
function itemText(item: InboxItem): string {
  if (item.kind === "note") {
    const n = item.note;
    const base = n.title?.trim() || n.body || "";
    return collapse(base).slice(0, 160) || "(empty note)";
  }
  if (item.kind === "task") return item.task.title;
  return item.prompt.text;
}

function isVoiceFailed(item: InboxItem): boolean {
  return item.kind === "note" && item.note.tags?.includes(VOICE_FAILED_TAG);
}

/** A bordered text button (secondary actions). */
function Btn({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "muted";
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className="h-11 items-center justify-center rounded-lg border border-border px-3"
    >
      <Text className={tone === "muted" ? "text-fg-muted" : "text-fg"}>{label}</Text>
    </Pressable>
  );
}

/** The one-tap "File under {project}" primary action, with the quiet color dot. */
function FileUnder({
  name,
  color,
  onPress,
}: {
  name: string;
  color: string | null;
  onPress: () => void;
}) {
  const dot = resolveProjectColor(color);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className="h-11 flex-row items-center gap-2 rounded-lg border border-border bg-surface-2 px-3"
    >
      {dot ? (
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
      ) : null}
      <Text className="text-fg" numberOfLines={1}>
        File under {name}
      </Text>
    </Pressable>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="gap-3 rounded-lg border border-border bg-surface p-4">
      {children}
    </View>
  );
}

function Meta({ children }: { children: string }) {
  return <Text className="text-sm text-fg-muted">{children}</Text>;
}

/**
 * One Inbox card. Filing cards (note/task) offer one-tap file-to-suggested (when
 * the classifier left a valid guess), a "File to…" picker, and Dismiss. Prompt
 * cards vary by type: question → Answer + Not now; discrepancy → It's correct
 * (Move is deferred — it's irreversible and needs a shared orchestrator); other
 * → Dismiss. All actions are handled by the screen (optimistic + undo).
 */
export function InboxCard({
  item,
  projects,
  onFileSuggested,
  onFilePick,
  onDismiss,
  onAnswer,
}: {
  item: InboxItem;
  projects: Record<string, ProjectMeta>;
  onFileSuggested: () => void;
  onFilePick: () => void;
  onDismiss: () => void;
  onAnswer: () => void;
}) {
  // Prompt cards
  if (item.kind === "prompt") {
    const type = item.prompt.type;
    return (
      <Card>
        <Text className="text-fg">{item.prompt.text}</Text>
        {type === "question" ? (
          <>
            <Meta>
              {item.whyProjectName
                ? `Adds to your ${item.whyProjectName} workflow`
                : "A question"}
            </Meta>
            <View className="flex-row gap-2">
              <Pressable
                onPress={onAnswer}
                hitSlop={4}
                className="h-11 items-center justify-center rounded-lg bg-accent px-4"
              >
                <Text className="font-medium text-accent-fg">Answer</Text>
              </Pressable>
              <Btn label="Not now" onPress={onDismiss} tone="muted" />
            </View>
          </>
        ) : type === "discrepancy" ? (
          <>
            <Meta>Possible mismatch — review on web to move it</Meta>
            <View className="flex-row gap-2">
              <Btn label="It's correct" onPress={onDismiss} />
            </View>
          </>
        ) : (
          <>
            <Meta>{`Nudge · ${fmtAgoFine(item.createdAt)}`}</Meta>
            <View className="flex-row gap-2">
              <Btn label="Dismiss" onPress={onDismiss} tone="muted" />
            </View>
          </>
        )}
      </Card>
    );
  }

  // Voice-failed placeholder note: no content to file, retry is server-only — dismiss only.
  if (isVoiceFailed(item)) {
    return (
      <Card>
        <Text className="text-fg">Voice note — transcription failed</Text>
        <Meta>The recording is saved.</Meta>
        <View className="flex-row gap-2">
          <Btn label="Dismiss" onPress={onDismiss} tone="muted" />
        </View>
      </Card>
    );
  }

  // Filing cards (note or task)
  const suggestedId =
    item.kind === "note" || item.kind === "task"
      ? item.suggestedProjectId
      : null;
  const suggested = suggestedId ? projects[suggestedId] : undefined;
  const kindLabel = item.kind === "note" ? "note" : "task";

  return (
    <Card>
      <Text className="text-fg">{itemText(item)}</Text>
      <Meta>{`${kindLabel} · captured ${fmtAgoFine(item.createdAt)}`}</Meta>
      <View className="flex-row flex-wrap gap-2">
        {suggested ? (
          <FileUnder
            name={suggested.name}
            color={suggested.color}
            onPress={onFileSuggested}
          />
        ) : null}
        <Btn label="File to…" onPress={onFilePick} />
        <Btn label="Dismiss" onPress={onDismiss} tone="muted" />
      </View>
    </Card>
  );
}
