#!/usr/bin/env node
/**
 * Deployment configuration guard.
 *
 * Vercel decides which Node.js version builds the site from the project
 * settings — unless the repository pins one. A pin produces this build warning
 * and silently overrides the setting:
 *
 *   Warning: Due to "engines": { "node": "22.x" } in your `package.json` file,
 *   the Node.js Version defined in your Project Settings ("26.x") will not
 *   apply, Node.js Version "22.x" will be used instead.
 *
 * `npm install` rewrites the root `engines` block in `package-lock.json` from
 * `package.json`, so a lockfile committed while a pin existed keeps the warning
 * alive even after the pin is removed from `package.json`. That is exactly what
 * happened in 1.1.0. This script fails the build if either file pins a Node
 * major, or if the lockfile version has drifted from `package.json`.
 *
 * Run standalone with: npm run verify:deploy
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));

const pkg = readJson("package.json");
const lock = readJson("package-lock.json");

/** "22.x", "^22.1.0", ">=20" … all pin a major; "" and "*" do not. */
const pinsMajor = (value) => {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (text === "" || text === "*" || text === "node") return false;
  return /^[~^=<>v\s]*\d/.test(text);
};

const problems = [];

if (pinsMajor(pkg.engines?.node)) {
  problems.push(
    `package.json declares engines.node = "${pkg.engines.node}". Remove it so the Vercel project setting decides the Node.js version.`
  );
}

const lockEngine = lock.packages?.[""]?.engines?.node;
if (pinsMajor(lockEngine)) {
  problems.push(
    `package-lock.json still records engines.node = "${lockEngine}" for the root package. Run "npm install --package-lock-only" to resync it with package.json.`
  );
}

if (lock.version !== pkg.version) {
  problems.push(
    `package-lock.json says version ${lock.version} but package.json says ${pkg.version}. Run "npm install --package-lock-only".`
  );
}

if (problems.length > 0) {
  console.error("Deployment configuration problems:\n");
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error(
    "\nThe Vercel project's Node.js version must govern the build; see README → Deploy to Vercel."
  );
  process.exit(1);
}

console.log(
  `deploy config ok: no engines.node pin (package.json ${pkg.version}, lockfile ${lock.version})`
);
