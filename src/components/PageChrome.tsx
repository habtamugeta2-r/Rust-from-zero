import React from "react";
import type { ChapterData, ChapterSummary, PartMeta } from "@/lib/guide-types";
import { PageInfoProvider, type PageContextValue } from "./GlossaryTipContext";

/**
 * Feed the client shell only what a page can be about.
 *
 * The shell is a client component, so everything it receives is serialised
 * into the page's RSC payload. The header was reading one chapter's title out
 * of the full list of 88 summaries, which meant the whole table of contents'
 * metadata travelled with every page. This helper narrows it to the one
 * chapter (if any) the current route shows.
 */
export function PageInfo({
  chapter,
  parts,
  children,
}: {
  chapter?: ChapterData | ChapterSummary | null;
  parts: PartMeta[];
  children: React.ReactNode;
}) {
  const value: PageContextValue = {};
  if (chapter) {
    const partTitle =
      "partTitle" in chapter && chapter.partTitle
        ? chapter.partTitle
        : (parts.find((part) => part.key === chapter.part)?.partTitle ?? "");
    value.chapter = {
      id: chapter.id,
      num: chapter.num,
      kind: chapter.kind,
      title: chapter.title,
      partTitle,
    };
  }
  return <PageInfoProvider value={value}>{children}</PageInfoProvider>;
}
