// Multi-tenant ChurchTheme provider.
// Resolves theme from: overrides > extracted (logo/cover) > fallback colors > defaults.
// Injects CSS vars at :root so every component can read --church-* tokens.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildTheme, themeToCssVars } from "./engine";
import { extractPalette } from "./extract";
import type { ChurchTheme, TenantBrandSource } from "./types";

interface ThemeContextValue {
  theme: ChurchTheme;
  /** Manually override one or more theme keys (manager UI). */
  setOverrides: (patch: Partial<ChurchTheme>) => void;
  /** Reset to auto-extracted theme. */
  resetOverrides: () => void;
}

const DEFAULT_THEME: ChurchTheme = buildTheme({ primary: "#1a3a5c", accent: "#C9993A" }, "default");

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setOverrides: () => {},
  resetOverrides: () => {},
});

export function useChurchTheme() {
  return useContext(ThemeContext);
}

interface ProviderProps {
  source?: TenantBrandSource;
  /** Sync theme tokens to <html> as CSS vars. Defaults to true. */
  injectCssVars?: boolean;
  children: React.ReactNode;
}

export function ChurchThemeProvider({ source, injectCssVars = true, children }: ProviderProps) {
  const [extracted, setExtracted] = useState<{
    primary?: string;
    accent?: string;
    background?: string;
  }>({});
  const [overrides, setOverridesState] = useState<Partial<ChurchTheme>>(source?.overrides ?? {});

  // Auto-extract from logo + cover when sources change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [logoPalette, coverPalette] = await Promise.all([
        source?.logoUrl
          ? extractPalette(source.logoUrl)
          : Promise.resolve({} as Awaited<ReturnType<typeof extractPalette>>),
        source?.coverUrl
          ? extractPalette(source.coverUrl)
          : Promise.resolve({} as Awaited<ReturnType<typeof extractPalette>>),
      ]);
      if (cancelled) return;
      setExtracted({
        primary: logoPalette.primary || coverPalette.primary,
        accent: logoPalette.accent || coverPalette.accent,
        background: coverPalette.background,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [source?.logoUrl, source?.coverUrl]);

  const theme = useMemo<ChurchTheme>(() => {
    const hasOverrides = overrides && Object.keys(overrides).length > 0;
    const hasExtracted = !!(extracted.primary || extracted.accent);

    let base: ChurchTheme;
    if (hasExtracted) {
      base = buildTheme(
        {
          primary: extracted.primary || source?.fallbackPrimary || undefined,
          accent: extracted.accent || source?.fallbackAccent || undefined,
          backgroundSeed: extracted.background,
        },
        "extracted",
      );
    } else if (source?.fallbackPrimary || source?.fallbackAccent) {
      base = buildTheme(
        {
          primary: source.fallbackPrimary || undefined,
          accent: source.fallbackAccent || undefined,
        },
        "fallback",
      );
    } else {
      base = DEFAULT_THEME;
    }

    if (hasOverrides) {
      return { ...base, ...overrides, source: "override" };
    }
    return base;
  }, [extracted, overrides, source?.fallbackPrimary, source?.fallbackAccent]);

  // Inject CSS variables at :root so any component can theme via tokens.
  useEffect(() => {
    if (!injectCssVars || typeof document === "undefined") return;
    const vars = themeToCssVars(theme);
    const root = document.documentElement;
    const previous: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars)) {
      previous[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    }
    return () => {
      for (const k of Object.keys(vars)) {
        if (previous[k]) root.style.setProperty(k, previous[k]);
        else root.style.removeProperty(k);
      }
    };
  }, [theme, injectCssVars]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setOverrides: (patch) => setOverridesState((prev) => ({ ...prev, ...patch })),
      resetOverrides: () => setOverridesState({}),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
