"use client";

import { deleteReceiptAction } from "./actions";

export function DeleteReceiptButton({
  receiptId,
  projectId,
  recordId,
}: {
  receiptId: string;
  projectId: string;
  recordId?: string;
}) {
  return (
    <form
      action={deleteReceiptAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this receipt? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={receiptId} />
      <input type="hidden" name="project_id" value={projectId} />
      {recordId ? (
        <input type="hidden" name="record_id" value={recordId} />
      ) : null}
      <button type="submit" className="btn btn-sm" aria-label="Delete receipt">
        ✕
      </button>
    </form>
  );
}
