import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ThemeSettings {
  mode: "dark" | "light" | "custom";
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  baseFontSize: number;
}

export const THEME_STORAGE_KEY = "prompt-forge-theme-v1";

export const DARK_THEME: ThemeSettings = {
  mode: "dark",
  backgroundColor: "#080a0e",
  textColor: "#e8edf2",
  accentColor: "#70e1b6",
  baseFontSize: 16,
};

export const LIGHT_THEME: ThemeSettings = {
  mode: "light",
  backgroundColor: "#f2f5f0",
  textColor: "#18231d",
  accentColor: "#087f5b",
  baseFontSize: 16,
};

export const DEFAULT_THEME = DARK_THEME;

interface ThemeContextValue {
  theme: ThemeSettings;
  previewTheme: (theme: ThemeSettings) => void;
  saveTheme: (theme: ThemeSettings) => ThemeSettings | null;
  resetTheme: () => void;
  clearPreview: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function normalizeHexColor(value: string): string | null {
  const match = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((character) => character + character)
          .join("")
      : match[1];
  return `#${hex.toUpperCase()}`;
}

export function sanitizeTheme(theme: ThemeSettings): ThemeSettings | null {
  const backgroundColor = normalizeHexColor(theme.backgroundColor);
  const textColor = normalizeHexColor(theme.textColor);
  const accentColor = normalizeHexColor(theme.accentColor);
  const baseFontSize = Math.round(theme.baseFontSize);
  if (
    !["dark", "light", "custom"].includes(theme.mode) ||
    !backgroundColor ||
    !textColor ||
    !accentColor ||
    !Number.isFinite(baseFontSize) ||
    baseFontSize < 14 ||
    baseFontSize > 24
  ) {
    return null;
  }
  return {
    mode: theme.mode,
    backgroundColor,
    textColor,
    accentColor,
    baseFontSize,
  };
}

function readSavedTheme(): ThemeSettings {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) return DEFAULT_THEME;
    const parsed = JSON.parse(saved) as Partial<ThemeSettings>;
    return (
      sanitizeTheme({
        mode:
          parsed.mode === "dark" ||
          parsed.mode === "light" ||
          parsed.mode === "custom"
            ? parsed.mode
            : "custom",
        backgroundColor:
          parsed.backgroundColor ?? DEFAULT_THEME.backgroundColor,
        textColor: parsed.textColor ?? DEFAULT_THEME.textColor,
        accentColor: parsed.accentColor ?? DEFAULT_THEME.accentColor,
        baseFontSize: parsed.baseFontSize ?? DEFAULT_THEME.baseFontSize,
      }) ?? DEFAULT_THEME
    );
  } catch {
    return DEFAULT_THEME;
  }
}

function relativeLuminance(hex: string) {
  const normalized = normalizeHexColor(hex) ?? "#000000";
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function applyTheme(theme: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty("--bg-color", theme.backgroundColor);
  root.style.setProperty("--text-main", theme.textColor);
  root.style.setProperty("--primary-color", theme.accentColor);
  root.style.setProperty("--text-color", theme.textColor);
  root.style.setProperty("--accent-color", theme.accentColor);
  root.style.setProperty("--base-font-size", `${theme.baseFontSize}px`);
  root.style.backgroundColor = theme.backgroundColor;
  root.style.setProperty(
    "--on-accent",
    relativeLuminance(theme.accentColor) > 0.48 ? "#07100D" : "#FFFFFF",
  );
  root.style.colorScheme =
    relativeLuminance(theme.backgroundColor) > 0.48 ? "light" : "dark";
  root.dataset.theme = theme.mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.backgroundColor);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeSettings>(readSavedTheme);
  const [preview, setPreview] = useState<ThemeSettings | null>(null);
  const effectiveTheme = preview ?? theme;

  useLayoutEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  const previewTheme = useCallback((nextTheme: ThemeSettings) => {
    const normalized = sanitizeTheme(nextTheme);
    if (normalized) setPreview(normalized);
  }, []);

  const saveTheme = useCallback((nextTheme: ThemeSettings) => {
    const normalized = sanitizeTheme(nextTheme);
    if (!normalized) return null;
    setTheme(normalized);
    setPreview(null);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // The visual settings still apply for this session if storage is unavailable.
    }
    return normalized;
  }, []);

  const resetTheme = useCallback(() => {
    setTheme(DEFAULT_THEME);
    setPreview(null);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(DEFAULT_THEME));
    } catch {
      // Reset remains effective for the current session.
    }
  }, []);

  const clearPreview = useCallback(() => setPreview(null), []);

  const value = useMemo(
    () => ({
      theme,
      previewTheme,
      saveTheme,
      resetTheme,
      clearPreview,
    }),
    [theme, previewTheme, saveTheme, resetTheme, clearPreview],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
