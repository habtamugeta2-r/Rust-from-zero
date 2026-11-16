"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Flag,
  FoldVertical,
  HelpCircle,
  KeyRound,
  ListChecks,
  Loader2,
  Pencil,
} from "lucide-react";
import type { ContentNode, ContentNodeKind, NavigationChapter, PartMeta } from "@/lib/guide-types";
import { findContentPath, flattenContentTree, headingItemsFromTree } from "@/lib/content-tree";
import { useActiveHeading } from "./use-active-heading";

/**
 * The sidebar curriculum & chapter outline tree.
 *
 * Three levels of hierarchy live here: a part holds its chapters, a chapter
 * holds its sections (`##`), and a section holds its subsections (`###`) and
 * key blocks (exercises, quizzes, key ideas, checklists, recaps). Every node
 * deep-links to its anchor, branches collapse independently, and the branch
 * containing the section currently being read opens and highlights on its own.
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

/** Only highlight interactive / special landmarks with icons so sections stay crisp and readable. */
function NodeGlyph({ kind }: { kind: ContentNodeKind }) {
  switch (kind) {
    case "key":
      return <KeyRound className="h-3 w-3 shrink-0 text-[var(--g-accent)]" aria-hidden="true" />;
    case "exercise":
      return <Pencil className="h-3 w-3 shrink-0 text-[var(--g-accent-2)]" aria-hidden="true" />;
    case "quiz":
      return <HelpCircle className="h-3 w-3 shrink-0 text-[var(--g-accent)]" aria-hidden="true" />;
    case "recap":
    case "checklist":
      return (
        <ListChecks className="h-3 w-3 shrink-0 text-[var(--g-accent-2)]" aria-hidden="true" />
      );
    default:
      return null;
  }
}

function chapterKey(chapterId: string) {
  return `chapter:${chapterId}`;
}

function nodeKey(chapterId: string, nodeId: string) {
  return `node:${chapterId}:${nodeId}`;
}

function compactPartBadge(part: PartMeta): string | null {
  if (part.partLabel) return part.partLabel.replace(/^Part\s+/i, "");
  if (part.key === "def") return "D";
  if (part.key === "app") return "A";
  return null;
}

export function ContentTree({
  parts,
  chapters,
  activeChapterId,
  done,
  loadingOutlines,
  onNavigate,
  onRequestOutline,
}: {
  parts: PartMeta[];
  chapters: NavigationChapter[];
  activeChapterId: string | null;
  done: Record<string, number>;
  loadingOutlines?: Record<string, boolean>;
  onNavigate: () => void;
  onRequestOutline: (chapterId: string) => void;
}) {
  const [collapsedParts, setCollapsedParts] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const restored = useRef(false);
  const navRef = useRef<HTMLElement>(null);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) ?? null,
    [chapters, activeChapterId],
  );

  const headingItems = useMemo(
    () => (activeChapter ? headingItemsFromTree(activeChapter.outline ?? []) : []),
    [activeChapter],
  );
  const activeHeadingId = useActiveHeading(headingItems);
  const activePath = useMemo(
    () =>
      activeChapter && activeHeadingId
        ? (findContentPath(activeChapter.outline ?? [], activeHeadingId) ?? [])
        : [],
    [activeChapter, activeHeadingId],
  );
  const activePathIds = useMemo(() => new Set(activePath.map((n) => n.id)), [activePath]);

  /* ---------------- persisted tree state ---------------- */

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
      /* private mode: defaults still give a working tree */
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

  /* Keep the section currently being read visible inside the sidebar pane. */
  useEffect(() => {
    if (!activeHeadingId || !navRef.current) return;
    const el = navRef.current.querySelector<HTMLElement>(
      `[data-content-anchor="${activeHeadingId}"]`,
    );
    const pane = el?.closest<HTMLElement>("[data-scroll-pane]");
    if (!el || !pane) return;
    const paneRect = pane.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();
    const pad = 12;
    if (itemRect.top < paneRect.top + pad) {
      pane.scrollTop -= paneRect.top + pad - itemRect.top;
    } else if (itemRect.bottom > paneRect.bottom - pad) {
      pane.scrollTop += itemRect.bottom - (paneRect.bottom - pad);
    }
  }, [activeHeadingId, activeChapterId]);

  /* ---------------- expansion model ---------------- */

  const isChapterExpanded = (chapter: NavigationChapter) => {
    const key = chapterKey(chapter.id);
    return key in expanded ? expanded[key] : chapter.id === activeChapterId;
  };

  const isNodeExpanded = (chapterId: string, node: ContentNode) => {
    const key = nodeKey(chapterId, node.id);
    if (key in expanded) return expanded[key];
    return chapterId === activeChapterId && activePathIds.has(node.id);
  };

  const toggleChapter = (chapter: NavigationChapter) =>
    setExpanded((prev) => ({
      ...prev,
      [chapterKey(chapter.id)]: !isChapterExpanded(chapter),
    }));

  const toggleNode = (chapterId: string, node: ContentNode) =>
    setExpanded((prev) => ({
      ...prev,
      [nodeKey(chapterId, node.id)]: !isNodeExpanded(chapterId, node),
    }));

  const collapseAllOutlines = () => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const chapter of chapters) {
        next[chapterKey(chapter.id)] = false;
        for (const { node } of flattenContentTree(chapter.outline ?? [])) {
          if (node.children.length > 0) next[nodeKey(chapter.id, node.id)] = false;
        }
      }
      return next;
    });
  };

  const revealActiveChapter = () => {
    if (!activeChapter) return;
    setCollapsedParts((prev) => ({ ...prev, [activeChapter.part]: false }));
    setExpanded((prev) => ({ ...prev, [chapterKey(activeChapter.id)]: true }));
    requestAnimationFrame(() => {
      const target =
        (activeHeadingId &&
          navRef.current?.querySelector<HTMLElement>(
            `[data-content-anchor="${activeHeadingId}"]`,
          )) ||
        navRef.current?.querySelector<HTMLElement>(`[data-chapter-row="${activeChapter.id}"]`);
      const pane = target?.closest<HTMLElement>("[data-scroll-pane]");
      if (!target || !pane) return;
      const paneRect = pane.getBoundingClientRect();
      const itemRect = target.getBoundingClientRect();
      pane.scrollTop += itemRect.top - paneRect.top - paneRect.height / 3;
    });
  };

  const togglePart = (key: string) => setCollapsedParts((prev) => ({ ...prev, [key]: !prev[key] }));

  const onNodeClick = (event: React.MouseEvent, chapterId: string, nodeId: string) => {
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

  const renderNode = (chapter: NavigationChapter, node: ContentNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const open = hasChildren && isNodeExpanded(chapter.id, node);
    const isCurrent =
      chapter.id === activeChapterId && node.id === activeHeadingId && node.id !== "";
    const panelId = `ctree-${chapter.id}-${node.id}`;

    return (
      <li key={node.id || node.label}>
        <div
          className={`flex items-center gap-0.5 rounded-md pr-1.5 transition-colors ${
            isCurrent
              ? "bg-[var(--g-accent-soft)] text-[var(--g-accent)]"
              : "hover:bg-[var(--g-surface)]"
          }`}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleNode(chapter.id, node)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`${open ? "Collapse" : "Expand"} “${node.label}”`}
              className="grid h-6 w-4 shrink-0 cursor-pointer place-items-center rounded text-[var(--g-ink3)] hover:text-[var(--g-ink)]"
            >
              {open ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="w-2 shrink-0" aria-hidden="true" />
          )}

          <Link
            href={node.id ? `/chapters/${chapter.id}#${node.id}` : `/chapters/${chapter.id}`}
            onClick={(event) => onNodeClick(event, chapter.id, node.id)}
            data-content-anchor={node.id || undefined}
            aria-current={isCurrent ? "location" : undefined}
            title={`${KIND_LABEL[node.kind]}: ${node.label}`}
            className={`flex min-w-0 flex-1 items-center gap-1.5 py-[5px] leading-snug ${
              isCurrent
                ? "font-semibold text-[var(--g-accent)]"
                : node.kind === "section"
                  ? "text-[12.5px] font-medium text-[var(--g-ink)]"
                  : "text-[12px] text-[var(--g-ink2)] hover:text-[var(--g-ink)]"
            }`}
          >
            <NodeGlyph kind={node.kind} />
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
          </Link>
        </div>

        {open && (
          <ol id={panelId} className="content-tree-children mt-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(chapter, child, depth + 1))}
          </ol>
        )}
      </li>
    );
  };

  return (
    <nav ref={navRef} aria-label="Content map" className="space-y-2">
      {/* Compact, calm map header */}
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-0.5">
        <p className="font-mono text-[10.5px] font-semibold tracking-[0.09em] text-[var(--g-ink3)] uppercase">
          Curriculum
        </p>
        <div className="flex items-center gap-1">
          {activeChapter && (
            <button
              type="button"
              onClick={revealActiveChapter}
              title="Jump to current chapter"
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--g-ink3)] transition-colors hover:bg-[var(--g-surface)] hover:text-[var(--g-accent)]"
            >
              <Crosshair className="h-3 w-3" aria-hidden="true" />
              <span>Current</span>
            </button>
          )}
          <button
            type="button"
            onClick={collapseAllOutlines}
            title="Collapse expanded chapter outlines"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--g-ink3)] transition-colors hover:bg-[var(--g-surface)] hover:text-[var(--g-ink)]"
          >
            <FoldVertical className="h-3 w-3" aria-hidden="true" />
            <span>Collapse</span>
          </button>
        </div>
      </div>

      {parts.map((part) => {
        const list = chapters.filter((c) => c.part === part.key);
        if (list.length === 0) return null;
        const isCollapsed = Boolean(collapsedParts[part.key]);
        const pDone = list.filter((c) => Boolean(done[c.id])).length;
        const allPartDone = part.key !== "app" && part.key !== "welcome" && pDone === list.length;
        const hasActiveChapter = activeChapter?.part === part.key;
        const badge = compactPartBadge(part);

        return (
          <div key={part.key} className="space-y-0.5">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              aria-controls={`part-list-${part.key}`}
              onClick={() => togglePart(part.key)}
              title={part.partTitle}
              className={`group flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                hasActiveChapter
                  ? "text-[var(--g-ink)] hover:bg-[var(--g-surface)]"
                  : "text-[var(--g-ink2)] hover:bg-[var(--g-surface)]/70 hover:text-[var(--g-ink)]"
              }`}
            >
              {isCollapsed ? (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)] transition-colors group-hover:text-[var(--g-ink)]"
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)] transition-colors group-hover:text-[var(--g-ink)]"
                  aria-hidden="true"
                />
              )}

              {badge && (
                <span
                  className={`inline-flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded px-1 font-mono text-[10px] font-semibold tabular-nums ${
                    hasActiveChapter
                      ? "bg-[var(--g-accent-soft)] text-[var(--g-accent)]"
                      : "bg-[var(--g-line)]/70 text-[var(--g-ink3)]"
                  }`}
                >
                  {badge}
                </span>
              )}

              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[-0.01em]">
                {part.title}
              </span>

              {part.key !== "app" && (
                <span
                  className={`shrink-0 font-mono text-[10.5px] tabular-nums ${
                    allPartDone
                      ? "font-semibold text-emerald-700 dark:text-emerald-400"
                      : "text-[var(--g-ink3)]"
                  }`}
                >
                  {pDone}/{list.length}
                </span>
              )}
            </button>

            {!isCollapsed && (
              <ol id={`part-list-${part.key}`} className="space-y-0.5 pb-1 pl-1.5">
                {list.map((chapter) => {
                  const isActive = chapter.id === activeChapterId;
                  const isDone = Boolean(done[chapter.id]);
                  const outline = chapter.outline;
                  const outlineNodes = outline ?? [];
                  const hasOutline = outlineNodes.length > 0;
                  const needsOutline = outline === undefined;
                  const wantOpen = isChapterExpanded(chapter);
                  const open = hasOutline && wantOpen;
                  const loadingOutline = Boolean(loadingOutlines?.[chapter.id]);
                  const panelId = `ctree-${chapter.id}`;

                  return (
                    <li key={chapter.id}>
                      <div
                        data-chapter-row={chapter.id}
                        className={`relative flex items-center gap-0.5 rounded-lg pr-1.5 transition-colors ${
                          isActive ? "bg-[var(--g-accent-soft)]" : "hover:bg-[var(--g-surface)]"
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 bottom-1.5 left-0 w-[2.5px] rounded-full bg-[var(--g-accent)]"
                          />
                        )}

                        {hasOutline || needsOutline ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (needsOutline) {
                                setExpanded((prev) => ({
                                  ...prev,
                                  [chapterKey(chapter.id)]: true,
                                }));
                                onRequestOutline(chapter.id);
                              } else {
                                toggleChapter(chapter);
                              }
                            }}
                            aria-expanded={open}
                            aria-controls={panelId}
                            aria-label={`${
                              needsOutline ? "Load" : open ? "Collapse" : "Expand"
                            } contents of “${chapter.short}”`}
                            className="ml-0.5 grid h-7 w-5 shrink-0 cursor-pointer place-items-center rounded text-[var(--g-ink3)] hover:text-[var(--g-ink)]"
                          >
                            {loadingOutline ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : open ? (
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          <span className="ml-0.5 w-5 shrink-0" aria-hidden="true" />
                        )}

                        <Link
                          href={`/chapters/${chapter.id}`}
                          onClick={onNavigate}
                          aria-current={isActive ? "page" : undefined}
                          title={chapter.title}
                          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 text-[13px] leading-snug ${
                            isActive
                              ? "font-semibold text-[var(--g-accent)]"
                              : "text-[var(--g-ink2)] hover:text-[var(--g-ink)]"
                          }`}
                        >
                          <span className="min-w-[1.5rem] shrink-0 font-mono text-[11px] tabular-nums text-[var(--g-ink3)]">
                            {chapter.num}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{chapter.short}</span>
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
                          <ol className="content-tree-children content-tree-chapter space-y-0.5">
                            {outlineNodes.map((node) => renderNode(chapter, node, 1))}
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
