"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.getAttribute("data-theme") !== "light");
  }, []);

  if (!mounted) return <div className="w-9 h-9" />;

  const toggle = () => {
    const next = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  return (
    <button
      onClick={toggle}
      className="w-9 h-9 flex items-center justify-center rounded-lg t-btn-ghost cursor-pointer"
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
    >
      <span
        className="material-symbols-outlined text-[18px]"
        style={{ color: "var(--fg-secondary)" }}
      >
        {dark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
