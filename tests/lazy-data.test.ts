import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET as getGlossaryEntry } from "../src/app/api/glossary/route";
import { GET as getChapterOutline } from "../src/app/api/outlines/route";

test("glossary endpoint returns only the requested public entry", async () => {
  const response = getGlossaryEntry(new NextRequest("http://localhost/api/glossary?term=variable"));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { term: Record<string, unknown> };
  assert.deepEqual(Object.keys(payload.term).sort(), ["definitionPlain", "key", "term"]);
  assert.equal(payload.term.key, "variable");
});

test("glossary endpoint rejects missing and unknown keys", async () => {
  const missing = getGlossaryEntry(new NextRequest("http://localhost/api/glossary"));
  assert.equal(missing.status, 400);

  const unknown = getGlossaryEntry(
    new NextRequest("http://localhost/api/glossary?term=not-a-glossary-term"),
  );
  assert.equal(unknown.status, 404);
});

test("outline endpoint returns one chapter graph rather than every outline", async () => {
  const response = getChapterOutline(new NextRequest("http://localhost/api/outlines?chapter=web"));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    chapter: string;
    outline: { id: string; children: unknown[] }[];
  };
  assert.equal(payload.chapter, "web");
  assert.ok(payload.outline.length > 0);
  assert.ok(payload.outline[0].id.startsWith("web--"));
});
