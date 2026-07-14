/* eslint-disable no-restricted-imports -- the ONE place the raw primitive is allowed */
import { TextInput as RNTextInput, type TextInputProps } from "react-native";

/**
 * App TextInput — Geist by default (same rationale as ui/text) plus the
 * app-wide placeholder tint: `placeholder:text-fg-muted` maps to
 * placeholderTextColor and follows the theme, replacing the old per-file
 * hardcoded #9ca3af. Import TextInput from here, never from react-native
 * (ESLint enforces it).
 */
export function TextInput({ className, ...props }: TextInputProps) {
  return (
    <RNTextInput
      className={`font-sans placeholder:text-fg-muted ${className ?? ""}`}
      {...props}
    />
  );
}
