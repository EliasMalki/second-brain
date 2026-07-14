/* eslint-disable no-restricted-imports -- the ONE place the raw primitive is allowed */
import { Text as RNText, type TextProps } from "react-native";

/**
 * App Text — Geist by default. RN has no style inheritance and React 19 killed
 * defaultProps, so the app-wide typeface is applied here: `font-sans` resolves
 * to Geist via the generated Tailwind preset, and the weight utilities
 * (font-medium/semibold/bold) swap to the matching Geist face. Import Text
 * from here, never from react-native (ESLint enforces it).
 */
export function Text({ className, ...props }: TextProps) {
  return <RNText className={`font-sans ${className ?? ""}`} {...props} />;
}
