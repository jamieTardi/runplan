"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem("runplan-theme") as Theme | null) ?? null;
    if (stored) {
      setTheme(stored);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("runplan-theme", next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="inline-flex items-center justify-center rounded-lg h-9 w-9 transition-colors"
      style={{ border: "1px solid var(--border-strong)", color: "var(--muted)" }}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
