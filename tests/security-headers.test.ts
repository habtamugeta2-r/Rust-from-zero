import assert from "node:assert/strict";
import { test } from "node:test";
import { contentSecurityPolicy } from "../src/lib/security-headers";

test("CSP permits React debugging in development only", () => {
  const development = contentSecurityPolicy(true);
  const production = contentSecurityPolicy(false);

  assert.match(development, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.doesNotMatch(production, /'unsafe-eval'/);
  assert.match(production, /script-src 'self' 'unsafe-inline'/);
  for (const policy of [development, production]) {
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /connect-src 'self' https:\/\/play\.rust-lang\.org/);
  }
});
