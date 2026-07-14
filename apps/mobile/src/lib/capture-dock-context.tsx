import { createContext, useContext, useEffect, useState } from "react";
import { useCapture } from "./use-capture";
import { useVoice } from "./use-voice";
import { useReceipt } from "./use-receipt";

type CaptureDock = {
  capture: ReturnType<typeof useCapture>;
  voice: ReturnType<typeof useVoice>;
  receipt: ReturnType<typeof useReceipt>;
  text: string;
  setText: (t: string) => void;
  receiptOpen: boolean;
  setReceiptOpen: (open: boolean) => void;
};

const Ctx = createContext<CaptureDock | null>(null);

/**
 * State for the persistent capture dock, mounted ONCE above the drawer
 * navigator so a draft, an in-flight voice upload, or a filing feedback card
 * survives navigating between screens. The visual bar (CaptureDockBar) renders
 * per-screen inside ScreenShell — state here, pixels there.
 */
export function CaptureDockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const capture = useCapture();
  const [text, setText] = useState("");
  const voice = useVoice((t) =>
    setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t)),
  );
  const receipt = useReceipt();
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Close the sheet once a receipt saves; the dock banner reports where.
  useEffect(() => {
    if (receipt.savedTo) setReceiptOpen(false);
  }, [receipt.savedTo]);

  return (
    <Ctx.Provider
      value={{ capture, voice, receipt, text, setText, receiptOpen, setReceiptOpen }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCaptureDock(): CaptureDock {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useCaptureDock must be used inside CaptureDockProvider");
  return ctx;
}
