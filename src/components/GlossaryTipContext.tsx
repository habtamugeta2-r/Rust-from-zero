"use client";

import { createContext, useContext } from "react";
import type { GlossaryTipItem } from "@/lib/guide-types";

/**
 * The glossary terms a single page can show.
 *
 * This context lives *inside* the page rather than in the root layout. It
 * matters for payload size: the root layout's props are serialised into every
 * page's RSC payload, so passing all 258 glossary definitions there shipped the
 * whole glossary with every chapter, the 404 page and the home page. Each page
 * now ships only the terms whose `[[…]]` markers appear in its own prose.
 */
const GlossaryTipContext = createContext<Record<string, GlossaryTipItem>>({});

export function GlossaryTipProvider({
  glossary,
  children,
}: {
  glossary: Record<string, GlossaryTipItem>;
  children: React.ReactNode;
}) {
  return <GlossaryTipContext.Provider value={glossary}>{children}</GlossaryTipContext.Provider>;
}

export function usePageGlossary(): Record<string, GlossaryTipItem> {
  return useContext(GlossaryTipContext);
}

/** The part and chapter one page is about, so the shell need not ship them all. */
export interface PageContextValue {
  partTitle?: string;
  /**
   * The chapter this page shows. The shell used to receive all 88 summaries and
   * look this one up on every route; a single chip in the header is the only
   * place it needed the answer, so the page passes just its own.
   */
  chapter?: { id: string; num: string; kind: string; title: string; partTitle: string };
}

const PageContext = createContext<PageContextValue>({});

export function PageInfoProvider({
  value,
  children,
}: {
  value: PageContextValue;
  children: React.ReactNode;
}) {
  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

export function usePageInfo(): PageContextValue {
  return useContext(PageContext);
}
