import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * The live iOS keyboard height. Needed because the editor's formatting bar
 * can't be an InputAccessoryView (that binds only to a native TextInput, not a
 * WebView) — it's a plain RN view we position at `bottom: keyboardHeight`. RN's
 * Keyboard module listens to the system UIKeyboard notifications, which fire
 * regardless of whether an RN input or the WebView's field raised the keyboard.
 * (The exact tracking feel over a WebView is a real-device check — Gate 2.)
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const subs = [
      Keyboard.addListener("keyboardWillChangeFrame", (e) => {
        // screenY at/after the screen bottom => keyboard is going away.
        const h = e.endCoordinates?.height ?? 0;
        setHeight(h > 0 ? h : 0);
      }),
      Keyboard.addListener("keyboardWillHide", () => setHeight(0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  return height;
}
