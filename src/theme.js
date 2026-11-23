import { createElement as h, useEffect, useState } from "react";

export function getTheme() {
  try {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
}

export function setTheme(t) {
  if (t === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme; // light = no attribute
  try { localStorage.setItem("theme", t); } catch { /* storage unavailable: theme still applies this session */ }
}

export function ThemeToggle() {
  const [theme, set] = useState(getTheme());
  useEffect(() => { setTheme(theme); }, [theme]);
  const next = theme === "dark" ? "light" : "dark";
  return h("button", {
    type: "button", className: "ghost theme-toggle", onClick: () => set(next),
    "aria-label": `Switch to ${next} theme`, title: `Switch to ${next} theme`,
  },
  h("span", { "aria-hidden": "true" }, theme === "dark" ? "☀" : "☾"),
  h("span", null, theme === "dark" ? "Light" : "Dark"));
}
