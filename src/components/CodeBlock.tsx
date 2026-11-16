import React from "react";
import { getBlockRunMode } from "@/lib/rust-runner";
import { CodeBlockActions } from "./CodeBlockActions";

export interface CodeBlockProps {
  lang: string;
  label: string;
  rawCode?: string;
  fullCode?: string;
  filename?: string;
  isContinuation: boolean;
  kind: string;
  isExt: boolean;
  noPlay: boolean;
  isRelease: boolean;
  isSoft: boolean;
  isOutput: boolean;
  isError: boolean;
  hasMain?: boolean;
  children: React.ReactNode;
}

/**
 * Server Component shell for guide code blocks.
 *
 * `runMode` is resolved on the server so `rawCode` is never duplicated in the
 * RSC flight payload — the client runner reads visible code from the rendered
 * `<pre><code>` DOM node (and receives `hiddenFullCode` only on the handful of
 * blocks that contain hidden `# ` setup lines).
 */
export function CodeBlock(props: CodeBlockProps) {
  if (props.isOutput || props.isError) {
    const borderTone = props.isError
      ? "border-red-300/80 dark:border-red-900/70"
      : "border-[var(--g-line)]";
    const bgTone = props.isError ? "bg-red-50/60 dark:bg-red-950/20" : "bg-[var(--g-sunken)]/80";
    const headTone = props.isError ? "bg-red-100/70 dark:bg-red-950/40" : "bg-[var(--g-code-head)]";

    return (
      <figure
        className={`group/code my-6 overflow-hidden rounded-well border shadow-card transition-shadow duration-200 hover:shadow-pop ${borderTone} ${bgTone} ${
          props.isSoft ? "code-soft" : ""
        }`}
      >
        <figcaption
          className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[var(--g-line)] px-3 py-2 font-sans text-xs sm:px-4 ${headTone}`}
        >
          <span className="flex items-center gap-2 font-semibold tracking-[0.08em] text-[var(--g-ink3)] uppercase">
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-[var(--g-line2)]"
              aria-hidden="true"
            />
            {props.label}
          </span>
          <span className="rounded-full border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--g-ink2)]">
            {props.isError ? "Compiler output" : "Output"}
          </span>
        </figcaption>

        <div
          className="code-scroll"
          data-scroll-pane
          tabIndex={0}
          role="group"
          aria-label={`${props.label} code`}
        >
          {props.children}
        </div>
      </figure>
    );
  }

  const runMode = getBlockRunMode({
    lang: props.lang,
    kind: props.kind,
    rawCode: props.rawCode,
    fullCode: props.fullCode,
    isExt: props.isExt,
    noPlay: props.noPlay,
  });

  const hiddenFullCode =
    runMode && props.fullCode && props.fullCode !== props.rawCode ? props.fullCode : undefined;

  return (
    <CodeBlockActions
      lang={props.lang}
      label={props.label}
      filename={props.filename}
      isContinuation={props.isContinuation}
      kind={props.kind}
      runMode={runMode}
      hiddenFullCode={hiddenFullCode}
      isRelease={props.isRelease}
      isSoft={props.isSoft}
    >
      {props.children}
    </CodeBlockActions>
  );
}
