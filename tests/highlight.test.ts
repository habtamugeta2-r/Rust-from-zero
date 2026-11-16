import assert from "node:assert/strict";
import test from "node:test";
import { highlightCode, highlightRustLines } from "../src/lib/highlight";

test("highlighting emits compact dual-theme token classes", async () => {
  const html = await highlightCode('fn main() { println!("hello"); }', "rust");
  assert.match(html, /<pre class="shiki"><code>/);
  assert.match(html, /<span class="s1">fn<\/span>/);
  assert.match(html, /<span class="s3">&quot;hello&quot;<\/span>/);
  assert.doesNotMatch(html, /--shiki-(?:light|dark)/);
});

test("highlighted Rust lines use the same compact token markup", async () => {
  const lines = await highlightRustLines("let answer = 42;");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /<span class="s4">42<\/span>/);
  assert.doesNotMatch(lines[0], /style=/);
});

test("unknown code languages are escaped without adding highlighting overhead", async () => {
  const html = await highlightCode("<tag>&", "plain-text");
  assert.equal(html, '<pre class="code-pre"><code>&lt;tag&gt;&amp;</code></pre>');
});
