import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { listProjects } from "@second-brain/shared/db/projects";
import { authedFetch } from "./api";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

export type ReceiptPhase = "idle" | "scanning" | "confirm" | "saving";
export type ReceiptForm = {
  amount: string;
  currency: string;
  vendor: string;
  purchasedOn: string;
  note: string;
};

type ProjectOption = { id: string; name: string };

const EMPTY_FORM: ReceiptForm = {
  amount: "",
  currency: "CAD",
  vendor: "",
  purchasedOn: "",
  note: "",
};

/**
 * Downscale to a ≤1600px JPEG. This both converts HEIC→JPEG on-device and keeps
 * the upload under the web route's 4 MB body limit (there is no server resize).
 */
async function downscaleToJpeg(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri)
    .resize({ width: 1600 })
    .renderAsync();
  const result = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return result.uri;
}

function jpegPart(uri: string) {
  // React Native FormData file part.
  return { uri, name: "receipt.jpg", type: "image/jpeg" } as unknown as Blob;
}

/**
 * Receipt capture: pick/snap a photo → downscale → OCR via /api/receipts/scan
 * (proposes, saves nothing) → confirm form + project picker → explicit save via
 * /api/receipts/create. Never auto-saves (same rule as web).
 */
export function useReceipt() {
  const { orgId } = useAuth();
  const [phase, setPhase] = useState<ReceiptPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [form, setForm] = useState<ReceiptForm>(EMPTY_FORM);
  const [readable, setReadable] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setImageUri(null);
    setForm(EMPTY_FORM);
    setReadable(true);
    setProjectId(null);
  }, []);

  const pick = useCallback(
    async (source: "camera" | "library") => {
      setError(null);
      setSavedTo(null);
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          source === "camera"
            ? "Camera access is off. Enable it in Settings to snap a receipt."
            : "Photo access is off. Enable it in Settings.",
        );
        return;
      }
      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (res.canceled || !res.assets?.[0]) return;

      setPhase("scanning");
      try {
        const jpeg = await downscaleToJpeg(res.assets[0].uri);
        setImageUri(jpeg);
        const projPromise = orgId
          ? listProjects(supabase, orgId)
          : Promise.resolve([]);

        const fd = new FormData();
        fd.append("photo", jpegPart(jpeg));
        const scanRes = await authedFetch("/api/receipts/scan", {
          method: "POST",
          body: fd,
        });
        const body = (await scanRes.json()) as {
          readable?: boolean;
          extraction?: {
            vendor?: string | null;
            total?: number | null;
            currency?: string | null;
            purchased_on?: string | null;
          } | null;
          error?: string;
        };
        if (!scanRes.ok) {
          setError(body.error ?? "Couldn't scan the receipt.");
          setPhase("idle");
          return;
        }
        const ex = body.extraction;
        setReadable(Boolean(body.readable));
        setForm({
          amount: ex?.total != null ? String(ex.total) : "",
          currency: ex?.currency ?? "CAD",
          vendor: ex?.vendor ?? "",
          purchasedOn: ex?.purchased_on ?? "",
          note: "",
        });
        const projs = await projPromise;
        setProjects(projs.map((p) => ({ id: p.id, name: p.name })));
        setPhase("confirm");
      } catch {
        setError("Couldn't process that photo.");
        setPhase("idle");
      }
    },
    [orgId],
  );

  const save = useCallback(async () => {
    if (!imageUri || !projectId) {
      setError("Pick a project to file this under.");
      return;
    }
    const amount = Number(form.amount.replace(/[$,\s]/g, ""));
    if (!form.amount.trim() || !Number.isFinite(amount)) {
      setError("Enter a valid amount.");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", jpegPart(imageUri));
      fd.append("amount", form.amount.trim());
      fd.append("currency", form.currency.trim() || "CAD");
      fd.append("vendor", form.vendor.trim());
      fd.append("purchasedOn", form.purchasedOn.trim());
      fd.append("note", form.note.trim());
      fd.append("projectId", projectId);
      const res = await authedFetch("/api/receipts/create", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save the receipt.");
        setPhase("confirm");
        return;
      }
      setSavedTo(projects.find((p) => p.id === projectId)?.name ?? "your project");
      reset();
    } catch {
      setError("Save failed — check your connection and try again.");
      setPhase("confirm");
    }
  }, [imageUri, projectId, form, projects, reset]);

  return {
    phase,
    error,
    imageUri,
    form,
    setForm,
    readable,
    projects,
    projectId,
    setProjectId,
    savedTo,
    clearSavedTo: () => setSavedTo(null),
    pick,
    save,
    reset,
  };
}
