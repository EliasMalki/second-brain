"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Scan a receipt by photo (v1 feature 2). Native camera on mobile
 * (capture="environment"), file picker on desktop. The photo is sent to
 * /api/receipts/scan which converts HEIC→JPEG and extracts fields with a vision
 * model. The extracted values pre-fill an editable confirmation form — the user
 * reviews/corrects, then saves. It NEVER auto-saves.
 *
 * Step 5: the confirm form (pre-filled, low-confidence fields flagged, record
 * suggestion). Persisting on Save is wired in Step 7.
 */

type RecordOption = { id: string; name: string };

type Extraction = {
  readable: boolean;
  vendor: string | null;
  vendor_confidence: number;
  total: number | null;
  total_confidence: number;
  currency: string | null;
  currency_confidence: number;
  purchased_on: string | null;
  purchased_on_confidence: number;
  suggested_record_id: string | null;
};

type ScanResponse = {
  imageBase64: string;
  imageMime: string;
  originalMime: string;
  originalExt: string;
  originalName: string;
  converted: boolean;
  readable: boolean;
  extraction: Extraction | null;
};

type Phase =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "confirm"; scan: ScanResponse; imageSrc: string; file: File }
  | { kind: "error"; message: string };

// Below this, a field is flagged "please check".
const LOW_CONFIDENCE = 0.6;

export function ScanReceiptForm({
  projectId,
  recordId,
  records,
}: {
  projectId: string;
  recordId?: string;
  records: RecordOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [fileName, setFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // confirm-form fields
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [recordSel, setRecordSel] = useState("");

  function reset() {
    setPhase({ kind: "idle" });
    setFileName(null);
    setSaveError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function prefill(ex: Extraction | null) {
    setAmount(ex?.total != null ? String(ex.total) : "");
    setCurrency(ex?.currency || "CAD");
    setVendor(ex?.vendor || "");
    setDate(ex?.purchased_on || "");
    setNote("");
    setRecordSel(ex?.suggested_record_id || "");
  }

  async function onScan() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setPhase({ kind: "scanning" });

    const fd = new FormData();
    fd.append("photo", file);
    fd.append("projectId", projectId);
    if (recordId) fd.append("recordId", recordId);
    try {
      const res = await fetch("/api/receipts/scan", { method: "POST", body: fd });
      if (res.status === 413) {
        throw new Error("That photo is too large — try a smaller one.");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const scan = (await res.json()) as ScanResponse;
      prefill(scan.extraction);
      setSaveError(null);
      setPhase({
        kind: "confirm",
        scan,
        imageSrc: `data:${scan.imageMime};base64,${scan.imageBase64}`,
        file,
      });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't scan that photo.",
      });
    }
  }

  async function onSave() {
    if (phase.kind !== "confirm") return;
    const amt = Number(amount.replace(/[$,\s]/g, ""));
    if (!amount.trim() || !Number.isFinite(amt)) {
      setSaveError("Enter a valid amount before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);

    // Send only the original photo — the server re-converts HEIC. Keeps the
    // request under Vercel's body limit.
    const fd = new FormData();
    fd.append("photo", phase.file);
    fd.append("amount", amount);
    fd.append("currency", currency);
    fd.append("vendor", vendor);
    fd.append("purchasedOn", date);
    fd.append("note", note);
    fd.append("projectId", projectId);
    if (recordId) fd.append("recordId", recordId);
    else if (recordSel) fd.append("recordId", recordSel);

    try {
      const res = await fetch("/api/receipts/create", { method: "POST", body: fd });
      if (res.status === 413) {
        throw new Error("That photo is too large — try a smaller one.");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      reset();
      router.refresh(); // re-render the receipts list + spend total
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the receipt.");
    } finally {
      setSaving(false);
    }
  }

  if (phase.kind === "confirm") {
    const ex = phase.scan.extraction;
    const unreadable = !phase.scan.readable || !ex;
    // a field needs checking when extraction failed, the value is missing, or
    // the model's confidence is low.
    const check = (conf: number | undefined, hasValue: boolean) =>
      unreadable || !hasValue || (conf ?? 0) < LOW_CONFIDENCE;

    const amountCheck = check(ex?.total_confidence, amount.trim() !== "");
    const vendorCheck = check(ex?.vendor_confidence, vendor.trim() !== "");
    const currencyCheck = check(ex?.currency_confidence, currency.trim() !== "");
    const dateCheck = check(ex?.purchased_on_confidence, date.trim() !== "");
    const anyCheck = amountCheck || vendorCheck || currencyCheck || dateCheck;

    const statusText = unreadable
      ? "Couldn't read this clearly — enter the details below."
      : anyCheck
        ? "Review the highlighted fields, then save."
        : "Looks good — review and save.";

    return (
      <div className="scan-form">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="scan-preview" src={phase.imageSrc} alt="Scanned receipt" />

        <p className={`scan-status ${unreadable ? "warn" : ""}`}>{statusText}</p>

        <div className="form">
          <div className="field-row">
            <div className={`field ${amountCheck ? "needs-check" : ""}`}>
              <label className="label" htmlFor="scan-amount">
                Amount {amountCheck ? <span className="check-tag">check</span> : null}
              </label>
              <input
                id="scan-amount"
                className="input"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className={`field ${currencyCheck ? "needs-check" : ""}`}>
              <label className="label" htmlFor="scan-currency">
                Currency
              </label>
              <input
                id="scan-currency"
                className="input"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
            <div className={`field ${dateCheck ? "needs-check" : ""}`}>
              <label className="label" htmlFor="scan-date">
                Date
              </label>
              <input
                id="scan-date"
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className={`field ${vendorCheck ? "needs-check" : ""}`}>
            <label className="label" htmlFor="scan-vendor">
              Vendor {vendorCheck ? <span className="check-tag">check</span> : null}
            </label>
            <input
              id="scan-vendor"
              className="input"
              placeholder="Vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="scan-note">
              Note <span className="help">(optional)</span>
            </label>
            <input
              id="scan-note"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {!recordId && records.length > 0 ? (
            <div className="field">
              <label className="label" htmlFor="scan-record">
                Record <span className="help">(optional — suggested)</span>
              </label>
              <select
                id="scan-record"
                className="select"
                value={recordSel}
                onChange={(e) => setRecordSel(e.target.value)}
              >
                <option value="">— none —</option>
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save receipt"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={reset}
              disabled={saving}
            >
              Cancel
            </button>
            {saveError ? (
              <p role="alert" className="error">
                {saveError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scan-form">
      <label htmlFor="scan-photo" className="label">
        Receipt photo <span className="help">(camera or file)</span>
      </label>
      <input
        id="scan-photo"
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="file-control"
        onChange={() => setFileName(fileRef.current?.files?.[0]?.name ?? null)}
      />
      {fileName ? <p className="help scan-filename">{fileName}</p> : null}
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={phase.kind === "scanning" || !fileName}
          onClick={onScan}
        >
          {phase.kind === "scanning" ? "Reading receipt…" : "Scan"}
        </button>
        {phase.kind === "error" ? (
          <p role="alert" className="error">
            {phase.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
