import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { THEME_INIT_SCRIPT } from "../src/lib/theme";

function initialiseTheme(saved: string | null, systemDark: boolean) {
  const attributes: Record<string, string> = {};
  const styles: Record<string, string> = {};
  let darkClass = false;
  runInNewContext(THEME_INIT_SCRIPT, {
    localStorage: { getItem: (key: string) => (key === "rust-guide-v1" ? saved : null) },
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: {
      documentElement: {
        classList: { toggle: (_name: string, enabled: boolean) => (darkClass = enabled) },
        setAttribute: (name: string, value: string) => (attributes[name] = value),
        style: { setProperty: (name: string, value: string) => (styles[name] = value) },
      },
    },
  });
  return { attributes, styles, darkClass };
}

test("theme initialisation restores a saved theme and text size", () => {
  const result = initialiseTheme(JSON.stringify({ theme: "dark", fs: 20 }), false);
  assert.equal(result.attributes["data-theme"], "dark");
  assert.equal(result.attributes["data-theme-mode"], "dark");
  assert.equal(result.styles["--guide-fs"], "20px");
  assert.equal(result.darkClass, true);
});

test("theme initialisation follows the system and ignores invalid text sizes", () => {
  const result = initialiseTheme(JSON.stringify({ theme: "system", fs: 99 }), true);
  assert.equal(result.attributes["data-theme"], "dark");
  assert.equal(result.attributes["data-theme-mode"], "system");
  assert.equal(result.styles["--guide-fs"], undefined);
  assert.equal(result.darkClass, true);
  assert.equal(initialiseTheme(null, false).attributes["data-theme"], "light");
});

test("theme initialisation tolerates corrupt saved settings", () => {
  assert.doesNotThrow(() => initialiseTheme("not json", false));
});
