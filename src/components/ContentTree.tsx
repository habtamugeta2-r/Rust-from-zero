"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Flag,
  FoldVertical,
  Hash,
  HelpCircle,
  KeyRound,
  ListChecks,
  Pencil,
  UnfoldVertical,
} from "lucide-react";
import type { ChapterSummary, ContentNode, ContentNodeKind, PartMeta } from "@/lib/guide-types";
import {
  contentKindCounts,
  countContentNodes,
  findContentPath,
  flattenContentTree,
  headingItemsFromTree,
} from "@/lib/content-tree";
import { useActiveHeading } from "./use-active-heading";

/**
 * The sidebar as a content map, not a page list.
 *
 * Three levels of graph live here: a part holds its chapters, a chapter
 * holds its sections (`##`), and a section holds its subsections (`###`)
 * and key content blocks (a `####` detail, a `:::key` idea, an exercise, a
 * quiz, a checklist, a recap). Every node deep-links to its anchor in the
 * chapter, branches collapse independently, and the branch containing the
 * section being read opens — and highlights — on its own.
 *
 * Expansion state is an explicit override map layered over those defaults,
 * so “expand all”, a reader's own collapses, and the scroll-spy's
 * auto-reveal never fight each other, and the map a reader arranged
 * survives a reload.
 */

const TREE_KEY = "rust-guide-content-tree-v1";

const KIND_LABEL: Record<ContentNodeKind, string> = {
  section: "Section",
  subsection: "Subsection",
  detail: "Key point",
  key: "Key idea",
  recap: "Recap",
  exercise: "Exercise",
  quiz: "Quiz",
  checklist: "Checklist",
};

function KindIcon({ kind, className }: { kind: ContentNodeKind; className?: string }) {
  const cls = className ?? "h-3.5 w-3.5";
  switch (kind) {
    case "section":
      return <Hash className={`${cls} text-[var(--g-accent-2)]`} aria-hidden="true" />;
    case "subsection":
      return <Hash className={`${cls} text-[var(--g-ink3)]`} aria-hidden="true" />;
    case "detail":
      return <CircleDot className={`${cls} text-[var(--g-ink3)]`} aria-hidden="true" />;
    case "key":
      return <KeyRound className={`${cls} text-[var(--g-accent)]`} aria-hidden="true" />;
    case "recap":
      return <ListChecks className={`${cls} text-[var(--g-accent-2)]`} aria-hidden="true" />;
    case "exercise":
      return <Pencil className={`${cls} text-[var(--g-accent-2)]`} aria-hidden="true" />;
    case "quiz":
      return <HelpCircle className={`${cls} text-[var(--g-accent)]`} aria-hidden="true" />;
    case "checklist":
      return <Check className={`${cls} text-[var(--g-accent-2)]`} aria-hidden="true" />;
  }
}

function chapterKey(chapterId: string) {
  return `chapter:${chapterId}`;
}

function nodeKey(chapterId: string, nodeId: string) {
  return `node:${chapterId}:${nodeId}`;
}

/** “6 sections · 2 key ideas · 3 exercises” for an expanded chapter. */
function chapterCaption(chapter: ChapterSummary): string {
  const counts = contentKindCounts(chapter.outline);
  const bits: string[] = [];
  if (counts.section)
    bits.push(`${counts.section} ${counts.section === 1 ? "section" : "sections"}`);
  const points = counts.detail + counts.key;
  if (points) bits.push(`${points} key ${points === 1 ? "point" : "points"}`);
  if (counts.exercise)
    bits.push(`${counts.exercise} ${counts.exercise === 1 ? "exercise" : "exercises"}`);
  if (counts.quiz) bits.push(`${counts.quiz} ${counts.quiz === 1 ? "quiz" : "quizzes"}`);
  return bits.join(" · ");
}

export function ContentTree({
  parts,
  chapters,
  activeChapterId,
  done,
  onNavigate,
}: {
  parts: PartMeta[];
  chapters: ChapterSummary[];
  activeChapterId: string | null;
  /** Completion timestamps per chapter id, as kept by GuideStateProvider. */
  done: Record<string, number>;
  onNavigate: () => void;
}) {
  const [collapsedParts, setCollapsedParts] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const restored = useRef(false);
  const navRef = useRef<HTMLElement>(null);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) ?? null,
    [chapters, activeChapterId],
  );

  /* Scroll-spy over the active chapter's headings, shared with the rail. */
  const headingItems = useMemo(
    () => (activeChapter ? headingItemsFromTree(activeChapter.outline) : []),
    [activeChapter],
  );
  const activeHeadingId = useActiveHeading(headingItems);
  const activePath = useMemo(
    () =>
      activeChapter && activeHeadingId
        ? (findContentPath(activeChapter.outline, activeHeadingId) ?? [])
        : [],
    [activeChapter, activeHeadingId],
  );
  const activePathIds = useMemo(() => new Set(activePath.map((n) => n.id)), [activePath]);

  const totalNodes = useMemo(
    () => chapters.reduce((sum, c) => sum + countContentNodes(c.outline), 0),
    [chapters],
  );

  /* ---------------- persisted map state ---------------- */

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TREE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          collapsedParts?: Record<string, boolean>;
          expanded?: Record<string, boolean>;
        };
        if (parsed.collapsedParts) setCollapsedParts(parsed.collapsedParts);
        if (parsed.expanded) setExpanded(parsed.expanded);
      }
    } catch {
      /* private mode: the defaults below still give a working map */
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      window.localStorage.setItem(TREE_KEY, JSON.stringify({ collapsedParts, expanded }));
    } catch {
      /* ignore */
    }
  }, [collapsedParts, expanded]);

  /* Keep the branch being read visible inside the sidebar pane. Adjusting
     the pane's own scrollTop (never the page's) mirrors ChapterRail. */
  useEffect(() => {
    if (!activeHeadingId || !navRef.current) return;
    const el = navRef.current.querySelector<HTMLElement>(
      `[data-content-anchor="${activeHeadingId}"]`,
    );
    const pane = el?.closest<HTMLElement>("[data-scroll-pane]");
    if (!el || !pane) return;
    const paneRect = pane.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();
    const pad = 8;
    if (itemRect.top < paneRect.top + pad) {
      pane.scrollTop -= paneRect.top + pad - itemRect.top;
    } else if (itemRect.bottom > paneRect.bottom - pad) {
      pane.scrollTop += itemRect.bottom - (paneRect.bottom - pad);
    }
  }, [activeHeadingId, activeChapterId]);

  /* ---------------- expansion model ---------------- */

  const isChapterExpanded = (chapter: ChapterSummary) => {
    const key = chapterKey(chapter.id);
    return key in expanded ? expanded[key] : chapter.id === activeChapterId;
  };

  const isNodeExpanded = (chapterId: string, node: ContentNode) => {
    const key = nodeKey(chapterId, node.id);
    if (key in expanded) return expanded[key];
    // Default: only the trail to the section being read is open.
    return chapterId === activeChapterId && activePathIds.has(node.id);
  };

  const toggleChapter = (chapter: ChapterSummary) =>
    setExpanded((prev) => ({
      ...prev,
      [chapterKey(chapter.id)]: !isChapterExpanded(chapter),
    }));

  const toggleNode = (chapterId: string, node: ContentNode) =>
    setExpanded((prev) => ({
      ...prev,
      [nodeKey(chapterId, node.id)]: !isNodeExpanded(chapterId, node),
    }));

  const setAll = (open: boolean) => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const chapter of chapters) {
        if (chapter.outline.length > 0) next[chapterKey(chapter.id)] = open;
        for (const { node } of flattenContentTree(chapter.outline)) {
          if (node.children.length > 0) next[nodeKey(chapter.id, node.id)] = open;
        }
      }
      return next;
    });
  };

  const togglePart = (key: string) => setCollapsedParts((prev) => ({ ...prev, [key]: !prev[key] }));

  /* A node click on the chapter already being read: close the drawer
     first, then jump — the drawer's scroll lock would otherwise swallow
     the anchor scroll (the same dance ChapterTocTrigger does). */
  const onNodeClick = (event: React.MouseEvent, chapterId: string, nodeId: string) => {
    // Let new-tab / new-window clicks behave like any other link.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    onNavigate();
    if (chapterId !== activeChapterId || !nodeId) return;
    event.preventDefault();
    window.setTimeout(() => {
      const el = document.getElementById(nodeId);
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      window.history.replaceState(null, "", `#${nodeId}`);
    }, 80);
  };

  /* ---------------- rendering ---------------- */

  const renderNode = (chapter: ChapterSummary, node: ContentNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const open = hasChildren && isNodeExpanded(chapter.id, node);
    const isCurrent =
      chapter.id === activeChapterId && node.id === activeHeadingId && node.id !== "";
    const panelId = `ctree-${chapter.id}-${node.id}`;
    const descendants = hasChildren ? countContentNodes(node.children) : 0;

    return (
      <li key={node.id || node.label}>
        <div
          className={`flex items-center gap-1 rounded-lg pr-1 transition-colors ${
            isCurrent ? "bg-[var(--g-accent-soft)]" : "hover:bg-[var(--g-surface)]"
          }`}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleNode(chapter.id, node)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`${open ? "Collapse" : "Expand"} “${node.label}”`}
              className="grid h-6 w-5 shrink-0 place-items-center rounded text-[var(--g-ink3)] hover:text-[var(--g-ink)]"
            >
              {open ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="w-5 shrink-0" aria-hidden="true" />
          )}

          <Link
            href={node.id ? `/chapters/${chapter.id}#${node.id}` : `/chapters/${chapter.id}`}
            onClick={(event) => onNodeClick(event, chapter.id, node.id)}
            data-content-anchor={node.id || undefined}
            aria-current={isCurrent ? "location" : undefined}
            title={`${KIND_LABEL[node.kind]} in ${chapter.short}: ${node.label}`}
            className={`flex min-w-0 flex-1 items-center gap-1.5 py-[5px] leading-snug ${
              node.kind === "section"
                ? "text-[12.5px] font-semibold text-[var(--g-ink)]"
                : node.kind === "subsection"
                  ? "text-[12px] font-medium text-[var(--g-ink2)]"
                  : "text-[11.5px] text-[var(--g-ink2)]"
            } ${isCurrent ? "font-semibold text-[var(--g-accent)]" : ""}`}
          >
            <KindIcon kind={node.kind} className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            {hasChildren && (
              <span
                className="shrink-0 text-[10px] font-medium text-[var(--g-ink3)] tabular-nums"
                title={`${descendants} nested ${descendants === 1 ? "topic" : "topics"}`}
              >
                {descendants}
              </span>
            )}
          </Link>
        </div>

        {open && (
          <ol id={panelId} className="content-tree-children">
            {node.children.map((child) => renderNode(chapter, child, depth + 1))}
          </ol>
        )}
      </li>
    );
  };

  return (
    <nav ref={navRef} aria-label="Content map" className="space-y-1">
      {/* Map header: what this is, how big the graph is, bulk controls. */}
      <div className="px-2 pt-1 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold tracking-[0.09em] text-[var(--g-ink3)] uppercase">
            Content map
          </p>
          <span className="text-[10.5px] font-medium text-[var(--g-ink3)] tabular-nums">
            {chapters.length} chapters · {totalNodes} topics
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] px-2 py-1 text-[10.5px] font-semibold text-[var(--g-ink2)] hover:text-[var(--g-accent)]"
          >
            <UnfoldVertical className="h-3 w-3" aria-hidden="true" />
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--g-line)] bg-[var(--g-surface)] px-2 py-1 text-[10.5px] font-semibold text-[var(--g-ink2)] hover:text-[var(--g-accent)]"
          >
            <FoldVertical className="h-3 w-3" aria-hidden="true" />
            Collapse all
          </button>
        </div>
        <div
          className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-[var(--g-ink3)]"
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-0.5">
            <Hash className="h-2.5 w-2.5" /> section
          </span>
          <span className="inline-flex items-center gap-0.5">
            <CircleDot className="h-2.5 w-2.5" /> key point
          </span>
          <span className="inline-flex items-center gap-0.5">
            <KeyRound className="h-2.5 w-2.5" /> key idea
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Pencil className="h-2.5 w-2.5" /> exercise
          </span>
          <span className="inline-flex items-center gap-0.5">
            <HelpCircle className="h-2.5 w-2.5" /> quiz
          </span>
        </div>
      </div>

      {parts.map((part) => {
        const list = chapters.filter((c) => c.part === part.key);
        if (list.length === 0) return null;
        const isCollapsed = Boolean(collapsedParts[part.key]);
        const pDone = list.filter((c) => Boolean(done[c.id])).length;

        return (
          <div key={part.key}>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              aria-controls={`part-list-${part.key}`}
              onClick={() => togglePart(part.key)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-[var(--g-ink2)] hover:bg-[var(--g-line)]/40 hover:text-[var(--g-ink)]"
            >
              {isCollapsed ? (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)]"
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)]"
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1 truncate">
                {part.partLabel && (
                  <span className="mr-1.5 text-[10.5px] tracking-wider text-[var(--g-ink3)] uppercase">
                    {part.partLabel}
                  </span>
                )}
                {part.title}
              </span>
              {part.key !== "app" && (
                <span className="text-[11px] font-medium text-[var(--g-ink3)] tabular-nums">
                  {pDone}/{list.length}
                </span>
              )}
            </button>

            {!isCollapsed && (
              <ol id={`part-list-${part.key}`} className="mt-0.5 space-y-0.5 pb-1.5 pl-3">
                {list.map((chapter) => {
                  const isActive = chapter.id === activeChapterId;
                  const isDone = Boolean(done[chapter.id]);
                  const hasOutline = chapter.outline.length > 0;
                  const open = hasOutline && isChapterExpanded(chapter);
                  const panelId = `ctree-${chapter.id}`;
                  const caption = open ? chapterCaption(chapter) : "";

                  return (
                    <li key={chapter.id}>
                      <div
                        className={`relative flex items-center gap-0.5 rounded-lg pr-1 transition-colors ${
                          isActive ? "bg-[var(--g-accent-soft)]" : "hover:bg-[var(--g-surface)]"
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 bottom-1.5 -left-2 w-[3px] rounded-full bg-[var(--g-accent)]"
                          />
                        )}
                        {hasOutline ? (
                          <button
                            type="button"
                            onClick={() => toggleChapter(chapter)}
                            aria-expanded={open}
                            aria-controls={panelId}
                            aria-label={`${open ? "Collapse" : "Expand"} contents of “${chapter.short}”`}
                            className="grid h-7 w-5 shrink-0 place-items-center rounded text-[var(--g-ink3)] hover:text-[var(--g-ink)]"
                          >
                            {open ? (
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" aria-hidden="true" />
                        )}

                        <Link
                          href={`/chapters/${chapter.id}`}
                          onClick={onNavigate}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 text-[13px] leading-snug ${
                            isActive
                              ? "font-semibold text-[var(--g-accent)]"
                              : "text-[var(--g-ink2)] hover:text-[var(--g-ink)]"
                          }`}
                        >
                          <span className="min-w-[1.6rem] shrink-0 font-mono text-[11px] tabular-nums text-[var(--g-ink3)]">
                            {chapter.num}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{chapter.short}</span>
                          {hasOutline && (
                            <span
                              className="shrink-0 text-[10px] font-medium text-[var(--g-ink3)] tabular-nums"
                              title={`${countContentNodes(chapter.outline)} topics inside this chapter`}
                            >
                              {countContentNodes(chapter.outline)}
                            </span>
                          )}
                          {chapter.kind === "project" && (
                            <Flag
                              className="h-3 w-3 shrink-0 text-[var(--g-accent)]"
                              aria-hidden="true"
                            />
                          )}
                          {isDone && (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                          )}
                        </Link>
                      </div>

                      {open && (
                        <div id={panelId}>
                          {caption && (
                            <p className="pt-0.5 pb-1 pl-6 text-[10.5px] font-medium text-[var(--g-ink3)]">
                              {caption}
                            </p>
                          )}
                          <ol className="content-tree-children content-tree-chapter">
                            {chapter.outline.map((node) => renderNode(chapter, node, 1))}
                          </ol>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </nav>
  );
}
