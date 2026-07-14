import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { colorScheme } from "nativewind";

export type ThemePref = "light" | "dark" | "system";

/** Mirrors web's localStorage key + values ("light" | "dark" | "system"). */
const KEY = "theme";

let current: ThemePref = "system";
const listeners = new Set<() => void>();

function isPref(v: unknown): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}

/**
 * Restore the persisted theme before first paint (awaited by the splash gate).
 * nativewind's colorScheme.set drives Appearance.setColorScheme, so BOTH the
 * @media(prefers-color-scheme) tokens in global.css and RN's useColorScheme()
 * follow the override; "system" clears it back to the OS scheme.
 */
export async function initTheme(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (isPref(stored)) current = stored;
  } catch {
    // unreadable storage -> stay on "system"
  }
  colorScheme.set(current);
}

export function setThemePref(pref: ThemePref): void {
  current = pref;
  colorScheme.set(pref);
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, pref).catch(() => {
    // persistence is best-effort; the in-session override already applied
  });
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
