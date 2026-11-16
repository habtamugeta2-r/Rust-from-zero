/**
 * Theme vocabulary, in one place.
 *
 * The cycle order, the wording and the type are shared by the header button,
 * the command palette and the provider that applies the choice — so the button
 * can never promise a change the provider will not make.
 */

export type ThemeMode = "light" | "dark" | "system";

/** light → dark → system → light. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
}

/** How the current choice is described: "dark mode", "follows your system". */
export function themeLabel(mode: ThemeMode): string {
  return mode === "system" ? "follows your system" : `${mode} mode`;
}

/** What pressing the control will do next. */
export function themeHint(mode: ThemeMode): string {
  const next = nextThemeMode(mode);
  if (next === "system") return "Follow the system setting";
  return `Switch to ${next}`;
}

/**
 * Queued with Next.js's beforeInteractive strategy so the saved preference is
 * applied before hydration. "system" is resolved in the browser, rather than
 * on the server, for statically cached pages.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem("rust-guide-v1");var d=raw?JSON.parse(raw):null;var mode=(d&&(d.theme==="dark"||d.theme==="light"||d.theme==="system"))?d.theme:"system";var theme=mode==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):mode;document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.setAttribute("data-theme",theme);document.documentElement.setAttribute("data-theme-mode",mode);if(d&&typeof d.fs==="number"&&d.fs>=15&&d.fs<=24){document.documentElement.style.setProperty("--guide-fs",d.fs+"px");}}catch(e){}})();`;
