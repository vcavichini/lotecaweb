"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    setTheme("dark");
    setMounted(true);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!mounted}
      style={{
        border: "1px solid var(--stroke)",
        background: "transparent",
        borderRadius: 999,
        padding: "10px 16px",
        color: "var(--text-soft)",
        cursor: mounted ? "pointer" : "default",
        opacity: mounted ? 1 : 0.6,
      }}
    >
      Tema: {theme === "dark" ? "escuro" : "claro"}
    </button>
  );
}
