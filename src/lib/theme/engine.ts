// Theme engine — derives a complete ChurchTheme from 1-2 seed colors.
// Uses tinycolor2 for variations + WCAG contrast validation.

import tinycolor from "tinycolor2";
import type { ChurchTheme } from "./types";

const MIN_CONTRAST = 4.5; // WCAG AA for body text

/** Returns "#FFFFFF" or a near-black that guarantees readable contrast on `bg`. */
export function readableTextOn(bg: string): string {
  const white = tinycolor.readability(bg, "#FFFFFF");
  const black = tinycolor.readability(bg, "#0B0F14");
  return white >= black ? "#FFFFFF" : "#0B0F14";
}

/** Nudges `fg` toward black/white until it reaches MIN_CONTRAST against `bg`. */
export function ensureContrast(fg: string, bg: string, min = MIN_CONTRAST): string {
  let c = tinycolor(fg);
  const bgIsDark = tinycolor(bg).isDark();
  let guard = 0;
  while (tinycolor.readability(c, bg) < min && guard < 30) {
    c = bgIsDark ? c.lighten(4) : c.darken(4);
    guard++;
  }
  return c.toHexString();
}

export interface BuildThemeInput {
  primary?: string | null;
  accent?: string | null;
  /** Optional dominant background color extracted from cover image */
  backgroundSeed?: string | null;
}

export function buildTheme(
  input: BuildThemeInput,
  source: ChurchTheme["source"] = "extracted",
): ChurchTheme {
  const primary = tinycolor(input.primary || "#1a3a5c");
  const accent = tinycolor(input.accent || "#C9993A");

  // Surfaces — keep them light by default to preserve current visual.
  const background = input.backgroundSeed
    ? tinycolor(input.backgroundSeed).lighten(40).toHexString()
    : "#FFFFFF";
  const surface = "#FFFFFF";
  const surfaceMuted = tinycolor(primary).setAlpha(0.04).toRgbString();

  const text = ensureContrast("#0B0F14", background);
  const textMuted = tinycolor(text).setAlpha(0.65).toRgbString();

  const textOnPrimary = ensureContrast(
    readableTextOn(primary.toHexString()),
    primary.toHexString(),
  );
  const textOnAccent = ensureContrast(readableTextOn(accent.toHexString()), accent.toHexString());

  const primaryLight = primary.clone().lighten(12).toHexString();
  const primaryDark = primary.clone().darken(12).toHexString();
  const primarySoft = primary.clone().setAlpha(0.08).toRgbString();

  const accentLight = accent.clone().lighten(12).toHexString();
  const accentDark = accent.clone().darken(12).toHexString();
  const accentSoft = accent.clone().setAlpha(0.18).toRgbString();

  const border = tinycolor(primary).setAlpha(0.12).toRgbString();
  const borderStrong = tinycolor(primary).setAlpha(0.24).toRgbString();
  const hover = tinycolor(primary).setAlpha(0.06).toRgbString();
  const ring = accent.clone().setAlpha(0.5).toRgbString();

  const gradientPrimary = `linear-gradient(135deg, ${primary.toHexString()} 0%, ${primaryDark} 100%)`;
  const gradientAccent = `linear-gradient(135deg, ${accent.toHexString()} 0%, ${accentDark} 100%)`;
  const gradientHero = `linear-gradient(135deg, ${primaryDark} 0%, ${primary.toHexString()} 60%, ${accent.toHexString()} 100%)`;

  return {
    primary: primary.toHexString(),
    primaryLight,
    primaryDark,
    primarySoft,
    accent: accent.toHexString(),
    accentLight,
    accentDark,
    accentSoft,
    background,
    surface,
    surfaceMuted,
    text,
    textMuted,
    textOnPrimary,
    textOnAccent,
    border,
    borderStrong,
    hover,
    ring,
    gradientPrimary,
    gradientAccent,
    gradientHero,
    isDark: tinycolor(background).isDark(),
    source,
  };
}

/** Flattens theme into CSS custom properties for global injection. */
export function themeToCssVars(t: ChurchTheme): Record<string, string> {
  return {
    "--church-primary": t.primary,
    "--church-primary-light": t.primaryLight,
    "--church-primary-dark": t.primaryDark,
    "--church-primary-soft": t.primarySoft,
    "--church-accent": t.accent,
    "--church-accent-light": t.accentLight,
    "--church-accent-dark": t.accentDark,
    "--church-accent-soft": t.accentSoft,
    "--church-bg": t.background,
    "--church-surface": t.surface,
    "--church-surface-muted": t.surfaceMuted,
    "--church-text": t.text,
    "--church-text-muted": t.textMuted,
    "--church-text-on-primary": t.textOnPrimary,
    "--church-text-on-accent": t.textOnAccent,
    "--church-border": t.border,
    "--church-border-strong": t.borderStrong,
    "--church-hover": t.hover,
    "--church-ring": t.ring,
    "--church-gradient-primary": t.gradientPrimary,
    "--church-gradient-accent": t.gradientAccent,
    "--church-gradient-hero": t.gradientHero,
  };
}
