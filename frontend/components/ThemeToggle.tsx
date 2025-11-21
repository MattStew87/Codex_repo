"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pine-theme";
type ThemeMode = "light" | "dark";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  const prefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  return prefersDark ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  
  const handleToggle = () => {
    const nextTheme: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="Theme toggle">
      <span className="theme-toggle__label">Theme</span>
      <button type="button" onClick={handleToggle} aria-pressed={theme === "dark"}>
        {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
      </button>
    </div>
  );
}
