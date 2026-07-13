import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { InboxItem } from "@second-brain/shared/db/inbox";
import { useInbox, inboxKey } from "@/lib/use-inbox";
import { InboxCard } from "@/components/inbox-card";
import { ProjectPickerSheet } from "@/components/project-picker-sheet";
import { AnswerSheet } from "@/components/answer-sheet";
import { UndoSnackbar } from "@/components/undo-snackbar";

type Section = { key: string; label: string; items: InboxItem[] };

function buildSections(items: InboxItem[]): Section[] {
  const filing = items.filter((i) => i.kind === "note" || i.kind === "task");
  const disc = items.filter(
    (i) => i.kind === "prompt" && i.prompt.type === "discrepancy",
  );
  const questions = items.filter(
    (i) => i.kind === "prompt" && i.prompt.type === "question",
  );
  const nudges = items.filter(
    (i) =>
      i.kind === "prompt" &&
      i.prompt.type !== "discrepancy" &&
      i.prompt.type !== "question",
  );
  const out: Section[] = [];
  if (filing.length) out.push({ key: "filing", label: "Needs filing", items: filing });
  if (disc.length) out.push({ key: "disc", label: "Worth a look", items: disc });
  if (questions.length)
    out.push({
      key: "q",
      label: questions.length === 1 ? "A question" : "A couple of questions",
      items: questions,
    });
  if (nudges.length)
    out.push({ key: "nudge", label: "Gentle nudges", items: nudges });
  return out;
}

export default function Inbox() {
  const {
    loading,
    refreshing,
    items,
    projects,
    projectOptions,
    refresh,
    fileNote,
    dismissNote,
    fileTask,
    dismissTask,
    dismissPromptItem,
    answerQuestion,
    undo,
    runUndo,
    clearUndo,
  } = useInbox();

  const [picker, setPicker] = useState<InboxItem | null>(null);
  const [answer, setAnswer] = useState<InboxItem | null>(null);

  const sections = useMemo(() => buildSections(items), [items]);

  function fileSuggested(item: InboxItem) {
    const id = item.kind !== "prompt" ? item.suggestedProjectId : null;
    if (!id) return;
    const name = projects[id]?.name ?? "project";
    if (item.kind === "note") fileNote(item.note.id, id, name);
    else if (item.kind === "task") fileTask(item.task.id, id, name);
  }

  function dismiss(item: InboxItem) {
    if (item.kind === "note") dismissNote(item.note.id);
    else if (item.kind === "task") dismissTask(item.task.id);
    else {
      const label =
        item.prompt.type === "question"
          ? "Question dismissed"
          : item.prompt.type === "discrepancy"
            ? "Marked correct"
            : "Nudge dropped";
      dismissPromptItem(item.prompt.id, label);
    }
  }

  function onPick(projectId: string, projectName: string) {
    const it = picker;
    setPicker(null);
    if (!it) return;
    if (it.kind === "note") fileNote(it.note.id, projectId, projectName);
    else if (it.kind === "task") fileTask(it.task.id, projectId, projectName);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="gap-1 px-6 pt-4">
        <Text className="text-2xl text-fg">Inbox</Text>
        <Text className="text-fg-muted">
          {items.length === 0
            ? "All caught up"
            : `${items.length} to clear · file it, answer it, or dismiss it`}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-24 gap-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator />
          </View>
        ) : sections.length === 0 ? (
          <Text className="py-2 text-fg-muted">Nothing to sort. Nice work.</Text>
        ) : (
          sections.map((s) => (
            <View key={s.key} className="gap-2">
              <View className="flex-row items-baseline gap-2">
                <Text className="text-sm font-medium uppercase tracking-wide text-fg-muted">
                  {s.label}
                </Text>
                <Text className="text-sm text-fg-muted">{s.items.length}</Text>
              </View>
              <View className="gap-3">
                {s.items.map((item) => (
                  <InboxCard
                    key={inboxKey(item)}
                    item={item}
                    projects={projects}
                    onFileSuggested={() => fileSuggested(item)}
                    onFilePick={() => setPicker(item)}
                    onDismiss={() => dismiss(item)}
                    onAnswer={() => setAnswer(item)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ProjectPickerSheet
        title={picker ? "File to…" : null}
        projects={projectOptions}
        onPick={onPick}
        onClose={() => setPicker(null)}
      />
      <AnswerSheet
        question={answer && answer.kind === "prompt" ? answer.prompt.text : null}
        onSubmit={async (text) => {
          if (answer && answer.kind === "prompt")
            await answerQuestion(answer.prompt.id, text);
        }}
        onClose={() => setAnswer(null)}
      />
      <UndoSnackbar
        message={undo?.message ?? null}
        nonce={undo?.nonce ?? 0}
        onUndo={runUndo}
        onExpire={clearUndo}
      />
    </SafeAreaView>
  );
}
