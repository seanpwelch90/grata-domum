import tokens from "@/contracts/design-tokens.json";
import type { ThemeTokens } from "@/lib/types";

export type WelcomeBookPalette = typeof tokens.default & {
  cardInk: string;
  cardMuted: string;
};
export type BuiltinThemeId = keyof typeof tokens;

export function builtinThemeTokens(id: BuiltinThemeId): ThemeTokens {
  const palette = tokens[id];
  return {
    id,
    name: id === "christmas" ? "Christmas at Home" : "Welcome Home",
    background: palette.canvas,
    backgroundSecondary: palette.comfort,
    text: palette.ink,
    textSecondary: palette.muted,
    accent: palette.accent,
    accentText: palette.onAccent,
    surface: palette.surface,
    surfaceText: palette.ink,
    surfaceMuted: palette.muted,
    motion: id === "christmas" ? "gentle" : "none",
    greetingStyle: id === "christmas" ? "festive" : "plain",
  };
}

/** Refresh cached built-in appearance from the manifest; preserve custom wire pairs. */
export function welcomeBookPalette(theme: ThemeTokens): WelcomeBookPalette {
  const builtin = theme.id === "default" || theme.id === "christmas";
  const base = theme.id === "christmas" ? tokens.christmas : tokens.default;
  if (builtin) {
    return { ...base, cardInk: base.ink, cardMuted: base.muted };
  }
  return {
    ...base,
    cardInk: theme.surfaceText,
    cardMuted: theme.surfaceMuted,
    canvas: theme.background,
    surface: theme.surface,
    ink: theme.text,
    muted: theme.textSecondary,
    accent: theme.accent,
    onAccent: theme.accentText,
    welcome: theme.surface,
    comfort: theme.surface,
    plan: theme.surface,
    weather: theme.surface,
  };
}
