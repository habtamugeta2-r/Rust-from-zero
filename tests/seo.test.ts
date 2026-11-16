import assert from "node:assert/strict";
import { test } from "node:test";
import { loadGuide } from "../src/lib/guide-parser";
import { chapterJsonLd, chapterMetadata } from "../src/lib/seo";

/**
 * Every chapter must carry the same shareable metadata. The regression these
 * tests exist for: `og:image` was only on the home page, so 88 chapter pages
 * shared as bare links, and the description claimed a crates.io dependency for
 * the `std`-only systems lab.
 */

const guide = loadGuide();
const chapters = guide.chapters;

test("seo: every chapter page carries og:image and en_GB locale", () => {
  for (const chapter of chapters) {
    const meta = chapterMetadata(chapter);
    assert.equal(meta.openGraph?.locale, "en_GB", `${chapter.id} locale`);
    const images = meta.openGraph?.images;
    assert.ok(Array.isArray(images) && images.length > 0, `${chapter.id} has no og:image`);
    const image = images[0] as { url: string; width?: number; height?: number };
    assert.equal(image.url, "/og.png");
    assert.equal(image.width, 1200);
    assert.equal(image.height, 630);
  }
});

test("seo: descriptions are short enough for a search result", () => {
  for (const chapter of chapters) {
    const desc = chapterMetadata(chapter).description ?? "";
    assert.ok(desc.length > 0, `${chapter.id} has an empty description`);
    assert.ok(desc.length <= 200, `${chapter.id} description is ${desc.length} characters`);
    assert.ok(!desc.includes("  "), `${chapter.id} description has a double space`);
  }
});

test("seo: a project description never claims a crate a std-only project lacks", () => {
  const lab = chapters.find((chapter) => chapter.id === "linux-systems-lab")!;
  const labDesc = chapterMetadata(lab).description ?? "";
  assert.ok(!labDesc.includes("crates.io"), labDesc);
  assert.ok(/standard library/.test(labDesc), labDesc);

  const api = chapters.find((chapter) => chapter.id === "project-api")!;
  assert.ok(/crates real programs use/.test(chapterMetadata(api).description ?? ""));
});

test("seo: JSON-LD is valid, absolute and British-English", () => {
  for (const chapter of chapters) {
    const [article, breadcrumb] = chapterJsonLd(chapter) as any[];
    assert.equal(article["@context"], "https://schema.org");
    assert.equal(article.inLanguage, "en-GB");
    assert.match(article.mainEntityOfPage["@id"], new RegExp(`/chapters/${chapter.id}$`));
    assert.match(article.dateModified, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(breadcrumb["@type"], "BreadcrumbList");
    assert.equal(breadcrumb.itemListElement.length, 3);
    // JSON.stringify must not throw and must round-trip.
    assert.deepEqual(JSON.parse(JSON.stringify(article)), article);
  }
});
