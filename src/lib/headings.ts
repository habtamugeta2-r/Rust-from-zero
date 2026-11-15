import type { HeadingItem } from "./guide-types";

/** Headings worth listing in a table of contents: `h2` and `h3`. */
export function tocItems(headings: HeadingItem[]): HeadingItem[] {
  return headings.filter((h) => h.level === 2 || h.level === 3);
}

/** Number of top-level sections, which is what the page counts for readers. */
export function sectionCount(headings: HeadingItem[]): number {
  return headings.filter((h) => h.level === 2).length;
}

/**
 * A table of contents is only worth screen space when the chapter really has
 * several sections. Both the page and the components use this so the wide
 * rail, the narrow sheet and the grid column always agree.
 */
export function hasTableOfContents(headings: HeadingItem[], min = 2): boolean {
  return sectionCount(headings) >= min;
}
