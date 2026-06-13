/**
 * One consistent empty state everywhere: a soft icon, a warm one-liner, and an
 * optional action. `compact` drops the card chrome for use inside a card
 * section (project tasks/notes, records, receipts).
 */
export function EmptyState({
  icon,
  title,
  action,
  compact = false,
}: {
  icon: string;
  title: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "empty empty-compact" : "card empty"}>
      <i className={`ti ${icon}`} aria-hidden="true" />
      <span>{title}</span>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
