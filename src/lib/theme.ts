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
