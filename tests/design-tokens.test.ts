import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import tokens from "@/contracts/design-tokens.json";
import { builtinThemeTokens, welcomeBookPalette } from "@/lib/design-tokens";
import { builtinThemes, contrastRatio, validateTheme } from "@/lib/domain";

// These prevent a return to independently hard-coded native/web built-in palettes.
describe("Welcome Book cross-platform color contract", () => {
  it("keeps the generated Swift palette byte-for-byte in sync with the source", () => {
    expect(() =>
      execFileSync(process.execPath, [
        "scripts/generate-design-tokens.mjs",
        "--check",
      ]),
    ).not.toThrow();
  });

  it("publishes the manifest colors through both server presets and shared fixtures", () => {
    for (const theme of builtinThemes()) {
      const expected = builtinThemeTokens(
        theme.id === "christmas" ? "christmas" : "default",
      );
      expect(theme).toEqual(expected);
      expect(validateTheme(theme)).toBeNull();
      const fixture = JSON.parse(
        readFileSync(`contracts/fixtures/${theme.id}.json`, "utf8"),
      );
      for (const key of [
        "background",
        "backgroundSecondary",
        "text",
        "textSecondary",
        "accent",
        "accentText",
        "surface",
        "surfaceText",
        "surfaceMuted",
      ] as const) {
        expect(fixture.theme[key], `${theme.id}.${key}`).toEqual(theme[key]);
      }
    }
  });

  it("keeps text and interactive boundaries readable across both built-in palettes", () => {
    for (const palette of Object.values(tokens)) {
      const surfaces = [
        palette.canvas,
        palette.surface,
        palette.welcome,
        palette.comfort,
        palette.plan,
        palette.weather,
      ];
      for (const surface of surfaces) {
        expect(contrastRatio(palette.ink, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.muted, surface)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(palette.accent, surface)).toBeGreaterThanOrEqual(
          3,
        );
      }
      expect(
        contrastRatio(palette.onAccent, palette.accent),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.danger, palette.dangerSurface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.caution, palette.cautionSurface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.controlEdge, palette.surface),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("refreshes old cached built-in colors without losing custom theme pairs", () => {
    const oldChristmas = {
      ...builtinThemeTokens("christmas"),
      background: "#102E26",
      text: "#FBF6EC",
      surface: "#FBF6EC",
      accent: "#E2B657",
    };
    expect(welcomeBookPalette(oldChristmas)).toMatchObject({
      canvas: tokens.christmas.canvas,
      ink: tokens.christmas.ink,
      cardInk: tokens.christmas.ink,
      welcome: tokens.christmas.welcome,
    });
    const custom = {
      ...oldChristmas,
      id: "night-garden",
      surfaceText: "#102E26",
      surfaceMuted: "#3D5A4E",
    };
    expect(welcomeBookPalette(custom)).toMatchObject({
      canvas: custom.background,
      ink: custom.text,
      cardInk: custom.surfaceText,
      cardMuted: custom.surfaceMuted,
      surface: custom.surface,
      welcome: custom.surface,
      comfort: custom.surface,
      plan: custom.surface,
      weather: custom.surface,
      accent: custom.accent,
    });
  });
});
