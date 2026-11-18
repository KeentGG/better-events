import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const KEY = "sm-theme";

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Theme preference stored per device. "system" follows the OS. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(read);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.dataset.theme = theme;
    try {
      if (theme === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
  }, [theme]);

  return [theme, setTheme] as const;
}

const darkQuery = "(prefers-color-scheme: dark)";

/** The theme actually on screen: the saved choice, or the OS setting when the choice is "system". */
export function useResolvedTheme(theme: ThemePreference): "light" | "dark" {
  const [systemDark, setSystemDark] = useState(() => matchMedia(darkQuery).matches);

  useEffect(() => {
    const mq = matchMedia(darkQuery);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}
