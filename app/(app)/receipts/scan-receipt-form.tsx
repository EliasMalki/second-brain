"use client";

import { useRef, useState } from "react";

/**
 * Scan a receipt by photo (v1 feature 2). Native camera on mobile
 * (capture="environment"), file picker on desktop. The photo is sent to
 * /api/receipts/scan which converts HEIC→JPEG and (from Step 4) extracts
 * fields. NEVER auto-saves — Step 5 adds the pre-filled confirmation form.
 *
 * Step 3: pick → scan → show the converted image, proving the HEIC round-trip
 * works through the real UI.
 */

type ScanResponse = {
  imageBase64: string;
  imageMime: string;
  originalMime: string;
  originalExt: string;
  originalName: string;
  converted: boolean;
};

type Phase =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "scanned"; imageSrc: string; converted: boolean }
  | { kind: "error"; message: string };

export function ScanReceiptForm({
  projectId,
  recordId,
}: {
  projectId: string;
  recordId?: string;
}) {
  // projectId/recordId are unused until the Save step (7); kept on the props so
  // the entry point is wired now.
  void projectId;
  void recordId;

  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [fileName, setFileName] = useState<string | null>(null);

  function reset() {
    setPhase({ kind: "idle" });
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onScan() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setPhase({ kind: "scanning" });

    const fd = new FormData();
    fd.append("photo", file);
    try {
      const res = await fetch("/api/receipts/scan", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ScanResponse;
      setPhase({
        kind: "scanned",
        imageSrc: `data:${data.imageMime};base64,${data.imageBase64}`,
        converted: data.converted,
      });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't scan that photo.",
      });
    }
  }

  if (phase.kind === "scanned") {
    return (
      <div className="scan-form">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="scan-preview" src={phase.imageSrc} alt="Scanned receipt" />
        <p className="help">
          {phase.converted ? "Converted from HEIC ✓ " : "Loaded ✓ "}
          Field extraction + save come next.
        </p>
        <button type="button" className="btn" onClick={reset}>
          Scan another
        </button>
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
          {phase.kind === "scanning" ? "Scanning…" : "Scan"}
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
