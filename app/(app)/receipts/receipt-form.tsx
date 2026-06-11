"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createReceiptAction, type FormState } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Add receipt"}
    </button>
  );
}

/** §10 manual entry: amount, currency, vendor, date, note, optional photo. */
export function ReceiptForm({
  projectId,
  recordId,
}: {
  projectId: string;
  recordId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createReceiptAction(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={formAction} className="form">
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
          Photo <span className="help">(optional — stored privately)</span>
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
        <SaveButton />
        {state.error ? (
          <p role="alert" className="error">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
