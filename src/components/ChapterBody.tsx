import React from "react";
import {
  AlertTriangle,
  ChevronRight,
  Info,
  KeyRound,
  Lightbulb,
  ListChecks,
  MessageSquare,
  Scale,
  Sparkles,
} from "lucide-react";
import { CALLOUT_LABELS } from "@/lib/guide-config";
import type { BlockNode, CalloutKind } from "@/lib/guide-types";
import { highlightCode, highlightRustLines } from "@/lib/highlight";
import { ChecklistWidget } from "./ChecklistWidget";
import { CodeBlock } from "./CodeBlock";
import { ExerciseCard } from "./ExerciseCard";
import { FlameGraph } from "./FlameGraph";
import { GlossaryDirectory } from "./GlossaryDirectory";
import { InlineRenderer } from "./InlineRenderer";
import { MemoryStepper } from "./MemoryStepper";
import { QuizWidget } from "./QuizWidget";

const CALLOUT_STYLES: Record<
  CalloutKind,
  { border: string; bg: string; labelColor: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  analogy: {
    border: "border-l-4 border-l-amber-500 border-[var(--g-line)]",
    bg: "bg-amber-50/45 dark:bg-amber-950/15",
    labelColor: "text-amber-700 dark:text-amber-300",
    Icon: Lightbulb,
  },
  plain: {
    border: "border-l-4 border-l-sky-500 border-[var(--g-line)]",
    bg: "bg-sky-50/45 dark:bg-sky-950/15",
    labelColor: "text-sky-700 dark:text-sky-300",
    Icon: MessageSquare,
  },
  compare: {
    border: "border-l-4 border-l-violet-500 border-[var(--g-line)]",
    bg: "bg-violet-50/40 dark:bg-violet-950/15",
    labelColor: "text-violet-700 dark:text-violet-300",
    Icon: Scale,
  },
  warn: {
    border: "border-l-4 border-l-red-500 border-[var(--g-line)]",
    bg: "bg-red-50/50 dark:bg-red-950/20",
    labelColor: "text-red-700 dark:text-red-300",
    Icon: AlertTriangle,
  },
  tip: {
    border: "border-l-4 border-l-emerald-500 border-[var(--g-line)]",
    bg: "bg-emerald-50/45 dark:bg-emerald-950/15",
    labelColor: "text-emerald-700 dark:text-emerald-300",
    Icon: Sparkles,
  },
  note: {
    border: "border-l-4 border-l-slate-400 border-[var(--g-line)]",
    bg: "bg-[var(--g-sunken)]/70",
    labelColor: "text-[var(--g-ink2)]",
    Icon: Info,
  },
  key: {
    border: "border-l-4 border-l-[var(--g-accent)] border-[var(--g-line)]",
    bg: "bg-[var(--g-accent-soft)]/45",
    labelColor: "text-[var(--g-accent)]",
    Icon: KeyRound,
  },
  recap: {
    border: "border-l-4 border-l-teal-600 border-[var(--g-line)]",
    bg: "bg-teal-50/45 dark:bg-teal-950/15",
    labelColor: "text-teal-700 dark:text-teal-300",
    Icon: ListChecks,
  },
};

export async function BlockList({ blocks }: { blocks: BlockNode[] }) {
  const rendered = await Promise.all(
    blocks.map((block, idx) => renderBlock(block, idx))
  );
  return <>{rendered}</>;
}

async function renderBlock(
  block: BlockNode,
  key: number
): Promise<React.ReactNode> {
  switch (block.type) {
    case "heading": {
      const HeadingTag = `h${block.level}` as "h2" | "h3" | "h4";
      // Heading sizes are in `em`, so they follow the reader's A- / A+ setting
      // instead of staying fixed while the prose grows around them.
      const cls =
        block.level === 2
          ? "mt-12 mb-4 scroll-mt-20 border-b border-[var(--g-line)] pb-2.5 font-sans text-[1.45em] leading-tight font-bold tracking-[-0.015em] text-[var(--g-ink)]"
          : block.level === 3
            ? "mt-8 mb-3 scroll-mt-20 font-sans text-[1.14em] leading-snug font-bold tracking-tight text-[var(--g-ink)]"
            : "mt-6 mb-2 scroll-mt-20 font-sans text-[1em] font-bold text-[var(--g-ink)]";
      return (
        <HeadingTag key={key} id={block.id} className={cls}>
          <InlineRenderer nodes={block.children} />
        </HeadingTag>
      );
    }

    case "paragraph":
      return (
        <p key={key} className="my-4 text-[var(--g-ink2)]">
          <InlineRenderer nodes={block.children} />
        </p>
      );

    case "hr":
      return <hr key={key} className="my-10 border-t border-[var(--g-line)]" />;

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-5 border-l-4 border-[var(--g-line2)] pl-4 italic text-[var(--g-ink2)]"
        >
          <BlockList blocks={block.blocks} />
        </blockquote>
      );

    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      const cls = block.ordered
        ? "my-4 list-decimal space-y-2 pl-6 text-[var(--g-ink2)] marker:font-sans marker:font-semibold marker:text-[var(--g-ink3)]"
        : "my-4 list-disc space-y-2 pl-6 text-[var(--g-ink2)] marker:text-[var(--g-accent)]";
      return (
        <ListTag key={key} className={cls}>
          {block.items.map((item, idx) => (
            <li key={idx} className="pl-1">
              <InlineRenderer nodes={item.children} />
              {item.blocks.length > 0 && (
                <div className="mt-2">
                  <BlockList blocks={item.blocks} />
                </div>
              )}
            </li>
          ))}
        </ListTag>
      );
    }

    case "table":
      return (
        <div
          key={key}
          className="my-6 overflow-x-auto rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)]"
        >
          <table className="w-full border-collapse text-left font-sans text-[14.5px]">
            <thead>
              <tr className="border-b border-[var(--g-line2)] bg-[var(--g-sunken)]">
                {block.headers.map((h, hi) => (
                  <th
                    key={hi}
                    className="px-4 py-2.5 font-bold text-[var(--g-ink)]"
                  >
                    <InlineRenderer nodes={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--g-line)]">
              {block.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-[var(--g-bg)]/60">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-2.5 align-top text-[var(--g-ink2)]"
                    >
                      <InlineRenderer nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "code": {
      const highlightedHtml = await highlightCode(block.code, block.lang);
      const copyPayload =
        block.isOutput || block.isError ? undefined : block.code;
      return (
        <CodeBlock
          key={key}
          lang={block.lang}
          label={block.label}
          rawCode={copyPayload}
          fullCode={block.fullCode}
          filename={block.filename}
          isContinuation={block.isContinuation}
          kind={block.kind}
          isExt={block.isExt}
          noPlay={block.noPlay}
          isRelease={block.isRelease}
          isSoft={block.isSoft}
          isOutput={block.isOutput}
          isError={block.isError}
        >
          <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        </CodeBlock>
      );
    }

    case "flame":
      return (
        <FlameGraph
          key={key}
          caption={
            block.caption.length > 0 ? (
              <InlineRenderer nodes={block.caption} />
            ) : null
          }
          roots={block.roots}
        />
      );

    case "callout": {
      const style = CALLOUT_STYLES[block.kind];
      const Icon = style.Icon;
      return (
        <aside
          key={key}
          className={`my-6 rounded-well border px-5 py-4 ${style.border} ${style.bg}`}
        >
          <div
            className={`mb-2 flex items-center gap-2 font-sans text-xs font-bold tracking-[0.06em] uppercase ${style.labelColor}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{CALLOUT_LABELS[block.kind]}</span>
          </div>
          {block.title && (
            <div className="mb-2 font-sans text-base font-bold text-[var(--g-ink)]">
              <InlineRenderer nodes={block.title} />
            </div>
          )}
          <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <BlockList blocks={block.blocks} />
          </div>
        </aside>
      );
    }

    case "details":
      return (
        <details
          key={key}
          className="my-5 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] px-5 py-3.5"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 font-sans text-[15.5px] font-semibold text-[var(--g-ink)] hover:text-[var(--g-accent)]">
            <ChevronRight className="h-4 w-4 text-[var(--g-ink3)]" aria-hidden="true" />
            <InlineRenderer nodes={block.title} />
          </summary>
          <div className="mt-3 border-t border-[var(--g-line)] pt-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <BlockList blocks={block.blocks} />
          </div>
        </details>
      );

    case "quiz": {
      const questions = await Promise.all(
        block.questions.map(async (q) => ({
          index: q.index,
          promptNode: <BlockList blocks={q.prompt} />,
          options: q.options.map((o) => ({
            label: o.label,
            correct: o.correct,
            content: <InlineRenderer nodes={o.children} />,
          })),
          explanationNode: <BlockList blocks={q.explanation} />,
        }))
      );
      return (
        <QuizWidget
          key={key}
          quizId={block.quizId}
          title={<InlineRenderer nodes={block.title} />}
          questions={questions}
        />
      );
    }

    case "exercise":
      return (
        <ExerciseCard
          key={key}
          exerciseId={block.exerciseId}
          kind={block.kind}
          title={<InlineRenderer nodes={block.title} />}
          body={<BlockList blocks={block.body} />}
          hint={block.hint ? <BlockList blocks={block.hint} /> : undefined}
          solution={
            block.solution ? <BlockList blocks={block.solution} /> : undefined
          }
        />
      );

    case "checklist":
      return (
        <ChecklistWidget
          key={key}
          items={block.items.map((it) => ({
            id: it.id,
            content: <InlineRenderer nodes={it.children} />,
          }))}
        />
      );

    case "stepper": {
      const highlightedLines = await highlightRustLines(block.code);
      return (
        <MemoryStepper
          key={key}
          title={<InlineRenderer nodes={block.title} />}
          highlightedLines={highlightedLines}
          steps={block.steps.map((s) => ({
            lines: s.lines,
            stack: s.stack,
            heap: s.heap,
            note: <InlineRenderer nodes={s.note} />,
          }))}
        />
      );
    }

    case "glossary":
      return (
        <GlossaryDirectory
          key={key}
          entries={block.entries.map((e) => ({
            plainTerm: e.plainTerm,
            plainDef: e.plainDef,
            termNode: <InlineRenderer nodes={e.term} />,
            defNode: <InlineRenderer nodes={e.definition} />,
          }))}
        />
      );
  }
}
