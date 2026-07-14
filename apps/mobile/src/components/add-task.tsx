import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { TextInput } from "@/components/ui/text-input";
import { resolveProjectColor } from "@second-brain/shared/domain/colors";
import { addDaysISO, endOfWeekISO, todayISO } from "@second-brain/shared/domain/dates";
import type { Priority } from "@second-brain/shared/db/tasks";
import type { NewTaskInput, ProjectOption } from "@/lib/use-tasks";

const HIT = { top: 6, bottom: 6, left: 4, right: 4 };

type QuickKey = "none" | "today" | "tomorrow" | "eow";

const DATES: { key: QuickKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "eow", label: "End of week" },
  { key: "none", label: "No date" },
];

const PRIORITIES: Priority[] = ["A", "B", "C", "D"];
// Selected priority: A/B carry their saturated chip color, C/D stay neutral
// (the root invariant). Unselected chips are a plain outline.
const PRIO_ON: Record<Priority, string> = {
  A: "bg-prio-a-bg",
  B: "bg-prio-b-bg",
  C: "bg-surface-3",
  D: "bg-surface-3",
};
const PRIO_ON_FG: Record<Priority, string> = {
  A: "text-prio-a-fg",
  B: "text-prio-b-fg",
  C: "text-fg-secondary",
  D: "text-fg-secondary",
};

function resolveScheduled(quick: QuickKey): string | null {
  switch (quick) {
    case "today":
      return todayISO();
    case "tomorrow":
      return addDaysISO(todayISO(), 1);
    case "eow":
      return endOfWeekISO();
    default:
      return null;
  }
}

/** A pill toggle (quick-date + "No project"). Filled monochrome when selected,
 *  outlined when not — both resting states legible (no hover on touch). */
function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT}
      className={`h-9 items-center justify-center rounded-full px-3 ${
        on ? "bg-accent" : "border border-border"
      }`}
    >
      <Text className={`text-sm ${on ? "text-accent-fg" : "text-fg-muted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A project pill with its quiet color dot; selection is the monochrome fill. */
function ProjectChip({
  project,
  on,
  onPress,
}: {
  project: ProjectOption;
  on: boolean;
  onPress: () => void;
}) {
  const dot = resolveProjectColor(project.color);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT}
      className={`h-9 flex-row items-center gap-1.5 rounded-full px-3 ${
        on ? "bg-accent" : "border border-border"
      }`}
    >
      {dot ? (
        <View
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: dot }}
        />
      ) : null}
      <Text className={`text-sm ${on ? "text-accent-fg" : "text-fg-muted"}`}>
        {project.name}
      </Text>
    </Pressable>
  );
}

/**
 * The Tasks add composer: a title bar with a contained "+", progressively
 * revealing quick-date chips, an A–D priority picker, and a project picker once
 * there's text. A direct shared createTask (via onAdd) — no web route. Kept
 * simple vs web's quick-add (no due/effort/repeat; recurrence isn't a mobile
 * screen).
 */
export function AddTask({
  projects,
  onAdd,
}: {
  projects: ProjectOption[];
  onAdd: (input: NewTaskInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [quick, setQuick] = useState<QuickKey>("none");
  const [priority, setPriority] = useState<Priority>("C");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && !busy;
  const reveal = title.trim().length > 0;

  async function submit() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        title: t,
        projectId,
        priority,
        scheduledFor: resolveScheduled(quick),
      });
      setTitle("");
      setQuick("none");
      setPriority("C");
      setProjectId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3 px-6 pb-1">
      <View className="flex-row items-center gap-3">
        <TextInput
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            if (error) setError(null);
          }}
          placeholder="Add a task…"
          returnKeyType="done"
          onSubmitEditing={submit}
          className="h-11 flex-1 rounded-lg border border-border bg-surface px-4 text-base text-fg"
        />
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityLabel="Add task"
          className={`h-11 w-11 items-center justify-center rounded-lg ${
            canSubmit ? "bg-accent" : "bg-surface-3"
          }`}
        >
          {busy ? (
            <ActivityIndicator className="text-accent-fg" />
          ) : (
            <Text
              className={`text-xl ${canSubmit ? "text-accent-fg" : "text-fg-muted"}`}
            >
              +
            </Text>
          )}
        </Pressable>
      </View>

      {reveal ? (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            {DATES.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                on={quick === d.key}
                onPress={() => setQuick(d.key)}
              />
            ))}
          </View>

          <View className="flex-row gap-2">
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
                hitSlop={HIT}
                accessibilityLabel={`Priority ${p}`}
                className={`h-9 w-9 items-center justify-center rounded ${
                  priority === p ? PRIO_ON[p] : "border border-border"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    priority === p ? PRIO_ON_FG[p] : "text-fg-muted"
                  }`}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>

          {projects.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 pr-6"
            >
              <Chip
                label="No project"
                on={projectId === null}
                onPress={() => setProjectId(null)}
              />
              {projects.map((p) => (
                <ProjectChip
                  key={p.id}
                  project={p}
                  on={projectId === p.id}
                  onPress={() => setProjectId(p.id)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {error ? <Text className="text-danger">{error}</Text> : null}
    </View>
  );
}
