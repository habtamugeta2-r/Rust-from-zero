import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { GET as searchGet } from "../src/app/api/search/route";
import { BlockList } from "../src/components/ChapterBody";
import { ChecklistWidget } from "../src/components/ChecklistWidget";
import { ExerciseCard } from "../src/components/ExerciseCard";
import { GlossaryDirectory } from "../src/components/GlossaryDirectory";
import { GuideFigure } from "../src/components/GuideFigure";
import { GuideStateProvider } from "../src/components/GuideStateProvider";
import { InlineRenderer } from "../src/components/InlineRenderer";
import { LandingMobileNav } from "../src/components/LandingMobileNav";
import { LandingShowcase } from "../src/components/LandingShowcase";
import { MemoryStepper } from "../src/components/MemoryStepper";
import { QuizWidget } from "../src/components/QuizWidget";
import { loadGuide } from "../src/lib/guide-parser";

function withState(node: React.ReactNode) {
  return renderToStaticMarkup(React.createElement(GuideStateProvider, { children: node }));
}

test("component: mobile landing navigation exposes all core destinations", () => {
  const html = renderToStaticMarkup(React.createElement(LandingMobileNav));
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
  assert.match(html, /aria-label="Mobile navigation"/);
  for (const href of ["/chapters", "/chapters/roadmap", "/progress", "/chapters/start"]) {
    assert.ok(html.includes(`href="${href}"`), `missing ${href}`);
  }
});

test("component: LandingShowcase renders accessible diagram tabs with light and dark SVG plates", () => {
  const html = renderToStaticMarkup(React.createElement(LandingShowcase));
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /role="tabpanel"/);
  assert.ok(html.includes('src="/images/ownership-move.svg"'));
  assert.ok(html.includes('src="/images/ownership-move-dark.svg"'));
  assert.ok(html.includes('href="/chapters/ownership"'));
});

test("component: GuideFigure renders light and dark SVG plates plus lightbox", () => {
  const html = renderToStaticMarkup(
    React.createElement(GuideFigure, {
      src: "/images/enum-niche-layout.svg",
      alt: "Option niche layout",
      caption: "Zero-cost Option<&T>",
    }),
  );
  assert.ok(html.includes('src="/images/enum-niche-layout.svg"'));
  assert.ok(html.includes('src="/images/enum-niche-layout-dark.svg"'));
  assert.ok(html.includes("guide-figure-light"));
  assert.ok(html.includes("guide-figure-dark"));
  assert.ok(html.includes("<dialog"));
  assert.ok(html.includes("Zero-cost Option&lt;&amp;T&gt;"));
});

test("component: every guide SVG figure has a matching dark-mode SVG plate", () => {
  const guide = loadGuide(true);
  const srcs = new Set<string>(["/images/end-to-end-trace.svg"]);
  for (const ch of guide.chapters) {
    for (const block of ch.blocks) {
      if (block.type === "figure") srcs.add(block.src);
    }
  }
  assert.ok(srcs.size >= 14, `expected at least 14 distinct SVGs, got ${srcs.size}`);
  for (const src of srcs) {
    assert.ok(src.endsWith(".svg"), `expected .svg figure, got ${src}`);
    const lightPath = path.join(process.cwd(), "public", src);
    const darkPath = path.join(process.cwd(), "public", src.replace(/\.svg$/, "-dark.svg"));
    assert.ok(fs.existsSync(lightPath), `missing light SVG: ${lightPath}`);
    assert.ok(fs.existsSync(darkPath), `missing dark SVG: ${darkPath}`);
    const darkXml = fs.readFileSync(darkPath, "utf8");
    assert.ok(darkXml.includes("#1C1A17"), `dark SVG ${darkPath} missing dark surface background`);
  }
});

test("component: InlineRenderer renders terms, chapter links, route links and external links", () => {
  const html = withState(
    React.createElement(InlineRenderer, {
      nodes: [
        { type: "term", key: "ownership", text: "ownership" },
        { type: "text", text: " " },
        {
          type: "internalLink",
          chapterId: "borrowing",
          children: [{ type: "text", text: "Chapter 10" }],
        },
        { type: "text", text: " " },
        {
          type: "routeLink",
          href: "/chapters",
          children: [{ type: "text", text: "All chapters" }],
        },
        { type: "text", text: " " },
        {
          type: "externalLink",
          href: "https://doc.rust-lang.org",
          children: [{ type: "text", text: "Docs" }],
        },
        { type: "kbd", text: "Enter" },
      ],
    }),
  );
  assert.ok(html.includes("ownership"));
  assert.ok(html.includes('href="/chapters/borrowing"'));
  assert.ok(html.includes('href="/chapters"'));
  assert.ok(html.includes('href="https://doc.rust-lang.org"'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes("<kbd"));
});

test("component: MemoryStepper renders code, stack frames, heap slots and step counter", () => {
  const html = renderToStaticMarkup(
    React.createElement(MemoryStepper, {
      title: "Vec growth",
      highlightedLines: ["<span>fn main() {</span>", "<span>let mut v = Vec::new();</span>"],
      steps: [
        {
          lines: [2],
          stack: [{ frame: "main", name: "v", value: "->#1 len 0 cap 2", state: "new" }],
          heap: [{ id: 1, value: "[_, _]", state: "new" }],
          note: "Buffer reserved",
        },
        {
          lines: [2],
          stack: [],
          heap: [{ id: 1, value: "[_, _]", state: "freed" }],
          note: "Freed",
        },
      ],
    }),
  );
  assert.ok(html.includes("Step through it: Vec growth"));
  assert.ok(html.includes("Step 1 of 2"));
  assert.ok(html.includes("main()"));
  assert.ok(html.includes("Buffer reserved"));
});

test("component: QuizWidget, ExerciseCard, ChecklistWidget and GlossaryDirectory render", () => {
  const quizHtml = withState(
    React.createElement(QuizWidget, {
      quizId: "q-test",
      title: "Check",
      questions: [
        {
          index: 0,
          promptNode: "What is 2 + 2?",
          options: [
            { label: "A", correct: false, content: "3" },
            { label: "B", correct: true, content: "4" },
          ],
          explanationNode: "2 + 2 = 4",
        },
      ],
    }),
  );
  assert.ok(quizHtml.includes("What is 2 + 2?"));
  assert.ok(quizHtml.includes("1 question"));

  const exHtml = withState(
    React.createElement(ExerciseCard, {
      exerciseId: "ex-test",
      kind: "guided",
      title: "Try it",
      body: React.createElement("p", null, "Write main."),
      hint: "Use println!",
      solution: 'println!("hi");',
    }),
  );
  assert.ok(exHtml.includes("Try it"));
  assert.ok(exHtml.includes("Use println!"));

  const checkHtml = withState(
    React.createElement(ChecklistWidget, {
      checklistId: "cl-test",
      items: [{ id: "cl-item-0", content: "Read chapter" }],
    }),
  );
  assert.ok(checkHtml.includes("Read chapter"));

  const glossHtml = withState(
    React.createElement(GlossaryDirectory, {
      entries: [
        {
          plainTerm: "borrow",
          plainDef: "temporary reference",
          termNode: "Borrow",
          defNode: "Temporary reference",
        },
      ],
    }),
  );
  assert.ok(glossHtml.includes("Borrow"));
  assert.ok(glossHtml.includes("Temporary reference"));
});

async function resolveValue(val: unknown): Promise<unknown> {
  if (Array.isArray(val)) return Promise.all(val.map(resolveValue));
  if (React.isValidElement(val)) return resolveAsyncTree(val);
  if (val && typeof val === "object" && Object.getPrototypeOf(val) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = await resolveValue(v);
    }
    return out;
  }
  return val;
}

async function resolveAsyncTree(node: React.ReactNode): Promise<React.ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map(resolveAsyncTree));
  }
  if (!React.isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  if (node.type === (BlockList as unknown)) {
    const resolved = await BlockList(
      props as { blocks: Parameters<typeof BlockList>[0]["blocks"] },
    );
    return resolveAsyncTree(resolved);
  }
  const nextProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    nextProps[k] = await resolveValue(v);
  }
  return React.cloneElement(node, nextProps);
}

test("e2e: BlockList renders real guide chapters including new SVGs and steppers", async () => {
  const guide = loadGuide(true);
  for (const id of ["enums", "collections", "shared-state", "kernel-syscalls-processes"]) {
    const ch = guide.chapters.find((c) => c.id === id);
    assert.ok(ch, `missing chapter ${id}`);
    const element = await resolveAsyncTree(await BlockList({ blocks: ch.blocks }));
    const html = withState(element);
    assert.ok(html.length > 1000, `chapter ${id} rendered too short`);
    if (id === "collections") {
      assert.ok(html.includes("Step through it:"), "collections missing stepper");
    }
    if (id === "shared-state") {
      assert.ok(html.includes("arc-mutex-dark.svg"), "shared-state missing dark SVG");
      assert.ok(html.includes("Step through it:"), "shared-state missing stepper");
    }
    if (id === "enums") {
      assert.ok(html.includes("enum-niche-layout-dark.svg"), "enums missing dark SVG");
    }
  }
});

test("e2e: /api/search route returns ranked hits and cache headers", async () => {
  const req = new NextRequest("http://localhost:3000/api/search?q=ownership&limit=5");
  const res = searchGet(req);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("cache-control")?.includes("max-age=60"));
  const body = (await res.json()) as {
    query: string;
    hits: Array<{ chapterId: string }>;
  };
  assert.equal(body.query, "ownership");
  assert.ok(body.hits.length > 0 && body.hits.length <= 5);
  assert.ok(body.hits.some((h) => h.chapterId === "ownership"));
});
