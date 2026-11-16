import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { GuideStateProvider, useGuideState } from "../src/components/GuideStateProvider";
import { TextSizeControls } from "../src/components/TextSizeControls";
import { ChaptersIndex } from "../src/components/ChaptersIndex";
import { loadGuide } from "../src/lib/guide-parser";
import { partAnchor, partHref } from "../src/lib/navigation";
import { collectChapterMeta } from "../src/lib/progress";

function MarkChapterOpened() {
  const { setLastChapter } = useGuideState();
  useEffect(() => setLastChapter("what-is-rust"), [setLastChapter]);
  return React.createElement(TextSizeControls);
}

test("part breadcrumbs point to unique curriculum sections", () => {
  const titles = [...new Set(loadGuide().summaries.map((chapter) => chapter.partTitle))];
  const anchors = titles.map(partAnchor);
  assert.equal(new Set(anchors).size, anchors.length);
  const chapters = loadGuide().chapters.map(collectChapterMeta);
  const html = renderToStaticMarkup(
    React.createElement(GuideStateProvider, null, React.createElement(ChaptersIndex, { chapters })),
  );
  for (const title of titles) {
    assert.equal(partHref(title), `/chapters#${partAnchor(title)}`);
    assert.ok(html.includes(`id="${partAnchor(title)}"`));
  }
});

test("reading size changes, persists, and preserves existing progress on a direct chapter visit", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://example.test/chapters/what-is-rust",
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  Object.defineProperty(dom.window, "matchMedia", {
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  dom.window.localStorage.setItem(
    "rust-guide-v1",
    JSON.stringify({
      done: { start: 1 },
      saved: { exercise: 1 },
      quiz: {},
      bookmarks: {},
      fs: 21,
      theme: "dark",
    }),
  );
  const container = dom.window.document.getElementById("root")!;
  let root = createRoot(container);
  const render = () =>
    React.createElement(GuideStateProvider, null, React.createElement(MarkChapterOpened));
  try {
    await act(async () => root.render(render()));
    assert.equal(dom.window.document.documentElement.style.getPropertyValue("--guide-fs"), "21px");
    let saved = JSON.parse(dom.window.localStorage.getItem("rust-guide-v1")!);
    assert.equal(saved.done.start, 1);
    assert.equal(saved.saved.exercise, 1);
    assert.equal(saved.last, "what-is-rust");
    assert.equal(saved.fs, 21);

    const increase = container.querySelector<HTMLButtonElement>(
      '[aria-label="Increase reading text size"]',
    )!;
    await act(async () => {
      increase.click();
      increase.click();
    });
    assert.equal(dom.window.document.documentElement.style.getPropertyValue("--guide-fs"), "23px");
    assert.equal(container.querySelector("output")?.textContent, "23");
    await act(async () => increase.click());
    assert.equal(increase.disabled, true);
    const decrease = container.querySelector<HTMLButtonElement>(
      '[aria-label="Decrease reading text size"]',
    )!;
    await act(async () => decrease.click());
    assert.equal(dom.window.document.documentElement.style.getPropertyValue("--guide-fs"), "23px");
    saved = JSON.parse(dom.window.localStorage.getItem("rust-guide-v1")!);
    assert.equal(saved.fs, 23);
    assert.equal(saved.done.start, 1);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(render()));
    assert.equal(container.querySelector("output")?.textContent, "23");
    assert.equal(dom.window.document.documentElement.style.getPropertyValue("--guide-fs"), "23px");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
