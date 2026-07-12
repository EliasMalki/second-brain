"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * §10 manual entry: amount, currency, vendor, date, note, optional photo.
 *
 * Submits via the /api/receipts/manual route handler (a fetch), NOT a server
 * action — a server action's body is capped at 1 MB, but the photo can be
 * bigger. The route stays under Vercel's ~4.5 MB serverless body limit (4 MB
 * photo cap), the same approach the scan flow uses.
 */
export function ReceiptForm({
  projectId,
  recordId,
}: {
  projectId: string;
  recordId?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // capture before any await (event is pooled)
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/receipts/manual", {
        method: "POST",
        body: new FormData(form),
      });
      if (res.status === 413) {
        throw new Error("That photo is too large — try a smaller one.");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      form.reset();
      router.refresh(); // re-render the receipts list + spend total
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="form">
      <input type="hidden" name="project_id" value={projectId} />
      {recordId ? (
        <input type="hidden" name="record_id" value={recordId} />
      ) : null}
      <div className="field-row">
        <div className="field">
          <label htmlFor="receipt-amount" className="label">
            Amount
          </label>
          <input
            id="receipt-amount"
            name="amount"
            className="input"
            required
            inputMode="decimal"
            placeholder="129.99"
          />
        </div>
        <div className="field">
          <label htmlFor="receipt-currency" className="label">
            Currency
          </label>
          <input
            id="receipt-currency"
            name="currency"
            className="input"
            defaultValue="CAD"
            maxLength={3}
          />
        </div>
        <div className="field">
          <label htmlFor="receipt-date" className="label">
            Date
          </label>
          <input
            id="receipt-date"
            name="purchased_on"
            type="date"
            className="input"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="receipt-vendor" className="label">
          Vendor
        </label>
        <input
          id="receipt-vendor"
          name="vendor"
          className="input"
          placeholder="Canadian Tire"
        />
      </div>
      <div className="field">
        <label htmlFor="receipt-note" className="label">
          Note <span className="help">(optional)</span>
        </label>
        <input
          id="receipt-note"
          name="note"
          className="input"
          placeholder="brake pads + labour"
        />
      </div>
      <div className="field">
        <label htmlFor="receipt-photo" className="label">
          Photo{" "}
          <span className="help">(optional, max 4 MB — stored privately)</span>
        </label>
        <input
          id="receipt-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="file-control"
        />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Add receipt"}
        </button>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
