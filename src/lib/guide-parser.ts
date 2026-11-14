import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CALLOUT_LABELS,
  CHECK_FLAGS,
  LANG_LABELS,
  RAW_PARTS,
  ROUTES,
} from "./guide-config";
import type {
  BlockNode,
  CalloutKind,
  ChapterData,
  ChapterKind,
  ChapterLevel,
  ChapterSummary,
  FlameNode,
  GlossaryEntry,
  HeadingItem,
  InlineNode,
  LoadedGuide,
  PartMeta,
  QuizQuestion,
  SearchEntry,
  StepperHeapEntry,
  StepperStackEntry,
  StepperStep,
} from "./guide-types";

const GUIDE_SRC = path.join(process.cwd(), "guide-src");
const CHAPTERS_DIR = path.join(GUIDE_SRC, "chapters");
const CAPTURED_DIR = path.join(GUIDE_SRC, "captured");

const SOFT_WRAP_AT = 100;
const BOX_DRAWING_RE = /[─│┌┐└┘├┤┬┴┼▲▼◄►]/;
const LIST_RE = /^([-*]|\d+\.)\s+(.*)$/;
const EX_KINDS = new Set(["guided", "practice", "challenge"]);

interface RawChapter {
  id: string;
  part: string;
  title: string;
  short: string;
  level: ChapterLevel;
  kind: ChapterKind;
  time: number;
  learn: string[];
  num: string;
  file: string;
  lines: string[];
}

interface ParseCtx {
  id: string;
  slugs: Set<string>;
  headings: HeadingItem[];
  quiz: number;
  ex: number;
  check: number;
  lastHash: string;
  glossary: Record<string, GlossaryEntry>;
  nums: Record<string, string>;
  links: { from: string; target: string }[];
  warnings: string[];
  stats: { code: number; exercises: number; questions: number; projects: number };
}

function slugify(text: string): string {
  const cleaned = text.toLowerCase().replace(/[`*\[\]]/g, "");
  return cleaned.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}

function isAlnum(ch: string): boolean {
  return /[a-zA-Z0-9\p{L}\p{N}]/u.test(ch);
}

const OPENERS = new Set([" ", "\t", "\n", "(", "[", "{", "—", "–", "-", "/", "\x01", ""]);

export function typo(input: string): string {
  const s = input.replaceAll(" -- ", " — ").replaceAll("...", "…");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '"' && ch !== "'") {
      out += ch;
      continue;
    }
    const prev = i > 0 ? s[i - 1] : "";
    const nxt = i + 1 < s.length ? s[i + 1] : "";
    const opening = prev === "" || OPENERS.has(prev);
    if (ch === '"') {
      out += opening ? "“" : "”";
    } else if (isAlnum(prev) || !opening) {
      out += "’";
    } else {
      out += isAlnum(nxt) ? "‘" : "’";
    }
  }
  return out;
}

export function inlinePlainText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
        case "kbd":
        case "term":
          return n.text;
        case "strong":
        case "em":
        case "internalLink":
        case "externalLink":
          return inlinePlainText(n.children);
      }
    })
    .join("");
}

function splitMarkdownInline(text: string, ctx: ParseCtx): InlineNode[] {
  // Placeholder tokens match build.py inline order so code/links/terms never get broken by * / ** / typo
  const stash: InlineNode[] = [];
  const keep = (node: InlineNode, opener = false): string => {
    const idx = stash.length;
    stash.push(node);
    const mark = opener ? "\x01" : "\x00";
    return `${mark}${idx}${mark}`;
  };

  let s = text;

  // 1. Backtick code spans
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) =>
    keep({ type: "code", text: code })
  );

  // 2. Escaped punctuation
  s = s.replace(/\\([*_\[\]`|{}\\#:<>])/g, (_, ch: string) =>
    keep({ type: "text", text: ch })
  );

  // 3. Keyboard shortcut tokens {{Key}}
  s = s.replace(/\{\{(.+?)\}\}/g, (_, kbd: string) =>
    keep({ type: "kbd", text: kbd })
  );

  // 4. Glossary term links [[shown|key]] or [[term]]
  s = s.replace(/\[\[(.+?)\]\]/g, (_, inner: string) => {
    const sep = inner.indexOf("|");
    const shown = sep >= 0 ? inner.slice(0, sep) : inner;
    const rawKey = sep >= 0 ? inner.slice(sep + 1) : shown;
    const key = rawKey.trim().toLowerCase();
    if (!ctx.glossary[key]) {
      ctx.warnings.push(`glossary term not found: [[${inner}]]`);
      return shown;
    }
    return keep({ type: "term", text: shown, key }, true);
  });

  // 5. Markdown links [label](target)
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, rawLabel: string, target: string) => {
    let label = rawLabel;
    if (target.startsWith("#")) {
      const rest = target.slice(1);
      const slashIdx = rest.indexOf("/");
      const cid = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
      const anchor = slashIdx >= 0 ? rest.slice(slashIdx + 1) : undefined;
      if (ctx.id) {
        ctx.links.push({ from: ctx.id, target: cid });
      }
      const mapped = ctx.nums[cid];
      const mnum = label.match(/^([Cc])hapter \d+$/);
      if (mnum && mapped && /^\d+$/.test(mapped)) {
        label = `${mnum[1]}hapter ${Number(mapped)}`;
      } else if (/^\d+$/.test(label) && mapped && /^\d+$/.test(mapped)) {
        label = String(Number(mapped));
      }
      return keep(
        {
          type: "internalLink",
          chapterId: cid,
          anchor: anchor || undefined,
          children: expandPlaceholders(typo(label), stash),
        },
        true
      );
    }
    return keep(
      {
        type: "externalLink",
        href: target,
        children: expandPlaceholders(typo(label), stash),
      },
      true
    );
  });

  // 6. Typographic quotes & dashes on prose
  s = typo(s);

  // 7. Bold & italic -> wrap markers so we can build nested InlineNode trees
  // Parse **bold** and *italic* safely after stashing
  return parseFormatting(s, stash);
}

function expandPlaceholders(input: string, stash: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  const re = /[\x00\x01](\d+)[\x00\x01]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", text: input.slice(last, m.index) });
    }
    out.push(stash[Number(m[1])]);
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    out.push({ type: "text", text: input.slice(last) });
  }
  return out;
}

function parseFormatting(input: string, stash: InlineNode[]): InlineNode[] {
  // Handle **strong** first, then *em* inside remaining text segments
  const nodes: InlineNode[] = [];
  const boldRe = /\*\*(?=\S)(.+?)(?<=\S)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(input)) !== null) {
    if (m.index > last) {
      nodes.push(...parseItalic(input.slice(last, m.index), stash));
    }
    nodes.push({
      type: "strong",
      children: parseItalic(m[1], stash),
    });
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    nodes.push(...parseItalic(input.slice(last), stash));
  }
  return nodes;
}

function parseItalic(input: string, stash: InlineNode[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  const emRe = /(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = emRe.exec(input)) !== null) {
    if (m.index > last) {
      nodes.push(...expandPlaceholders(input.slice(last, m.index), stash));
    }
    nodes.push({
      type: "em",
      children: expandPlaceholders(m[1], stash),
    });
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    nodes.push(...expandPlaceholders(input.slice(last), stash));
  }
  return nodes;
}

function visibleRust(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const st = raw.trimStart();
    if (st === "#" || st.startsWith("# ")) {
      continue;
    }
    if (st.startsWith("## ")) {
      out.push(raw.replace("## ", "# "));
    } else {
      out.push(raw);
    }
  }
  return out;
}

function renderFlame(caption: string, lines: string[], ctx: ParseCtx): BlockNode {
  interface RawNode {
    label: string;
    pct: number;
    long: string;
    kids: RawNode[];
  }
  const root: RawNode = { label: "root", pct: 100.0, long: "root", kids: [] };
  const stack: [number, RawNode][] = [[-1, root]];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const leading = raw.length - raw.trimStart().length;
    const depth = Math.floor(leading / 2);
    const fields = raw.trim().split("|").map((f) => f.trim());
    const pct = Number(fields[1]);
    if (fields.length < 2 || Number.isNaN(pct)) {
      ctx.warnings.push(`${ctx.id}: bad flame line ${JSON.stringify(raw)}`);
      continue;
    }
    const node: RawNode = {
      label: fields[0],
      pct,
      long: fields[2] ?? fields[0],
      kids: [],
    };
    while (stack[stack.length - 1][0] >= depth) {
      stack.pop();
    }
    stack[stack.length - 1][1].kids.push(node);
    stack.push([depth, node]);
  }

  let counter = 0;
  const convert = (node: RawNode, parentPct: number): FlameNode => {
    counter += 1;
    const hue = 8 + ((counter * 23) % 40);
    const widthPct = Math.min(100, (100 * node.pct) / parentPct);
    return {
      id: `fl-${counter}`,
      label: node.label,
      long: node.long,
      pct: node.pct,
      widthPct,
      hue,
      children: node.kids.map((k) => convert(k, node.pct)),
    };
  };

  return {
    type: "flame",
    caption: caption ? splitMarkdownInline(caption, ctx) : [],
    roots: root.kids.map((k) => convert(k, 100)),
  };
}

function renderCode(info: string, rawLines: string[], ctx: ParseCtx): BlockNode {
  const parts = info.trim() ? info.trim().split(/\s+/) : [];
  const lang = parts[0] || "text";
  if (lang === "flame") {
    return renderFlame(info.trim().slice(5).trim(), rawLines, ctx);
  }
  const flags = parts.slice(1);
  let filename: string | undefined;
  for (const f of flags) {
    if (f.startsWith("file=")) {
      filename = f.slice(5);
    }
  }
  const isContinuation = Boolean(filename && flags.includes("cont"));
  const kind = flags.find((f) => CHECK_FLAGS.has(f)) ?? "";
  let lines = [...rawLines];
  let fullCode: string | undefined;

  if (lang === "rust") {
    ctx.lastHash = crypto
      .createHash("sha1")
      .update(rawLines.join("\n"), "utf8")
      .digest("hex")
      .slice(0, 16);
    const hidden = rawLines.some((l) => {
      const st = l.trimStart();
      return st === "#" || st.startsWith("# ");
    });
    if ((kind === "run" || kind === "wrap") && (hidden || kind === "wrap") && !flags.includes("ext")) {
      const src: string[] = [];
      for (const l of rawLines) {
        const st = l.trimStart();
        if (st === "#") {
          src.push("");
        } else if (st.startsWith("# ")) {
          src.push(l.replace("# ", ""));
        } else if (st.startsWith("## ")) {
          src.push(l.replace("## ", "# "));
        } else {
          src.push(l);
        }
      }
      let full = src.join("\n").replace(/^\n+|\n+$/g, "");
      if (kind === "wrap") {
        const indented = full
          .split("\n")
          .map((l) => (l.trim() ? `    ${l}` : ""))
          .join("\n");
        full = `fn main() {\n${indented}\n}`;
      }
      fullCode = full;
    }
    lines = visibleRust(rawLines);
  }

  if ((lang === "output" || lang === "error") && flags.includes("auto")) {
    const capPath = path.join(CAPTURED_DIR, `${ctx.lastHash || "none"}.txt`);
    if (fs.existsSync(capPath)) {
      lines = fs.readFileSync(capPath, "utf8").replace(/\n+$/, "").split("\n");
      for (const f of flags) {
        if (f.startsWith("lines=")) {
          const max = Number(f.slice(6));
          if (!Number.isNaN(max) && lines.length > max) {
            lines = [...lines.slice(0, max), "..."];
          }
        }
      }
    } else {
      ctx.warnings.push(`${ctx.id}: no captured text for an \`auto\` block yet (run tools/check.py)`);
      lines = ["(run tools/check.py to fill this in)"];
    }
  }

  const code = lines.join("\n").replace(/^\n+|\n+$/g, "");
  const isOutput = lang === "output";
  const isError = lang === "error";
  const isPanicOutput = flags.includes("panic");
  const label =
    isOutput && isPanicOutput
      ? "Output (the program crashed)"
      : (LANG_LABELS[lang] ?? lang.toUpperCase());

  const hasLongLine =
    lines.length > 0 && Math.max(...lines.map((l) => l.length)) > SOFT_WRAP_AT;
  const hasBoxDrawing = lines.some((l) => BOX_DRAWING_RE.test(l));
  const isSoft =
    flags.includes("soft") ||
    ((lang === "text" || lang === "output") &&
      !flags.includes("nosoft") &&
      hasLongLine &&
      !hasBoxDrawing);

  if (!isOutput && !isError) {
    ctx.stats.code += 1;
  }

  return {
    type: "code",
    lang,
    label,
    code,
    fullCode,
    filename,
    isContinuation,
    kind,
    isExt: flags.includes("ext"),
    noPlay: flags.includes("noplay"),
    isRelease: lang === "rust" && flags.includes("release"),
    isSoft,
    isOutput,
    isError,
    isPanicOutput,
  };
}

function isBlockStart(line: string): boolean {
  const s = line.trim();
  return (
    s.startsWith("```") ||
    s.startsWith(":::") ||
    s.startsWith("|") ||
    s.startsWith("> ") ||
    /^#{2,4}\s/.test(s) ||
    LIST_RE.test(s) ||
    s === "---"
  );
}

function splitRow(rawRow: string): string[] {
  let row = rawRow.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "`") {
      inCode = !inCode;
      cur += ch;
    } else if (ch === "\\" && i + 1 < row.length && row[i + 1] === "|") {
      cur += "|";
      i += 1;
    } else if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function renderTable(rows: string[], ctx: ParseCtx): BlockNode {
  const headers = splitRow(rows[0]).map((c) => splitMarkdownInline(c, ctx));
  const bodyRows =
    rows.length > 1 && /^\|[\s:|-]+\|?$/.test(rows[1]) ? rows.slice(2) : rows.slice(1);
  return {
    type: "table",
    headers,
    rows: bodyRows.map((r) => splitRow(r).map((c) => splitMarkdownInline(c, ctx))),
  };
}

function renderList(buf: string[], ctx: ParseCtx): BlockNode {
  const ordered = /^\d+\./.test(buf[0]);
  const items: { text: string; sub: string[] }[] = [];
  for (const line of buf) {
    const m = line.match(LIST_RE);
    if (m && !line.startsWith(" ")) {
      items.push({ text: m[2], sub: [] });
    } else if (items.length > 0) {
      items[items.length - 1].sub.push(line);
    }
  }

  return {
    type: "list",
    ordered,
    items: items.map((item) => {
      let text = item.text;
      let blocks: BlockNode[] = [];
      if (item.sub.length > 0) {
        const indents = item.sub
          .filter((l) => l.trim().length > 0)
          .map((l) => l.length - l.trimStart().length);
        const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
        const stripped = item.sub.map((l) => l.slice(minIndent));
        let k = 0;
        while (k < stripped.length && !isBlockStart(stripped[k])) {
          text += " " + stripped[k].trim();
          k += 1;
        }
        if (k < stripped.length) {
          blocks = parseBlocks(stripped.slice(k), ctx);
        }
      }
      return {
        children: splitMarkdownInline(text, ctx),
        blocks,
      };
    }),
  };
}

function renderQuiz(title: string, buf: string[], ctx: ParseCtx): BlockNode {
  interface RawQ {
    q: string[];
    opts: { ok: boolean; text: string }[];
    exp: string[];
  }
  const qs: RawQ[] = [];
  let cur: RawQ | null = null;
  let mode: "q" | "o" | "e" | null = null;
  let fence = false;

  for (const line of buf) {
    const s = line.trimEnd();
    if (s.trim().startsWith("```")) fence = !fence;
    if (!fence && s.startsWith("? ")) {
      cur = { q: [s.slice(2)], opts: [], exp: [] };
      qs.push(cur);
      mode = "q";
    } else if (cur === null) {
      continue;
    } else if (!fence && (mode === "q" || mode === "o") && /^[-+] /.test(s)) {
      cur.opts.push({ ok: s[0] === "+", text: s.slice(2) });
      mode = "o";
    } else if (!fence && s.startsWith("= ")) {
      cur.exp.push(s.slice(2));
      mode = "e";
    } else if (mode === "q") {
      cur.q.push(line);
    } else if (mode === "e") {
      cur.exp.push(line);
    } else if (mode === "o" && s.trim()) {
      cur.opts[cur.opts.length - 1].text += " " + s.trim();
    }
  }

  ctx.quiz += 1;
  const quizId = `${ctx.id}-q${ctx.quiz}`;
  const letters = "ABCDEF";
  const questions: QuizQuestion[] = qs.map((q, qi) => {
    ctx.stats.questions += 1;
    const correctCount = q.opts.filter((o) => o.ok).length;
    if (correctCount !== 1) {
      ctx.warnings.push(`${quizId}: question ${qi + 1} must have exactly one correct option`);
    }
    return {
      index: qi,
      prompt: parseBlocks(q.q, ctx),
      options: q.opts.map((o, oi) => ({
        label: letters[oi] ?? String(oi + 1),
        correct: o.ok,
        children: splitMarkdownInline(o.text, ctx),
      })),
      explanation: parseBlocks(q.exp, ctx),
    };
  });

  return {
    type: "quiz",
    quizId,
    title: splitMarkdownInline(title || "Quick check", ctx),
    questions,
  };
}

function renderExercise(title: string, buf: string[], ctx: ParseCtx): BlockNode {
  const spaceIdx = title.indexOf(" ");
  let kind = spaceIdx >= 0 ? title.slice(0, spaceIdx) : title;
  let rest = spaceIdx >= 0 ? title.slice(spaceIdx + 1) : "";
  if (!EX_KINDS.has(kind)) {
    kind = "practice";
    rest = title;
  }

  const body: string[] = [];
  const hint: string[] = [];
  const sol: string[] = [];
  let mode: "body" | "hint" | "sol" = "body";

  for (const line of buf) {
    const t = line.trim();
    if (t === "::hint") mode = "hint";
    else if (t === "::solution") mode = "sol";
    else if (mode === "body") body.push(line);
    else if (mode === "hint") hint.push(line);
    else sol.push(line);
  }

  ctx.ex += 1;
  ctx.stats.exercises += 1;
  const exerciseId = `${ctx.id}-x${ctx.ex}`;
  if (sol.length === 0) {
    ctx.warnings.push(`${exerciseId}: exercise without a solution`);
  }

  return {
    type: "exercise",
    exerciseId,
    kind: kind as "guided" | "practice" | "challenge",
    title: splitMarkdownInline(rest, ctx),
    body: parseBlocks(body, ctx),
    hint: hint.length > 0 ? parseBlocks(hint, ctx) : undefined,
    solution: sol.length > 0 ? parseBlocks(sol, ctx) : undefined,
  };
}

function renderChecklist(buf: string[], ctx: ParseCtx): BlockNode {
  ctx.check += 1;
  const checklistId = `${ctx.id}-c${ctx.check}`;
  const items: { id: string; children: InlineNode[] }[] = [];
  let k = 0;
  for (const line of buf) {
    const m = line.trim().match(LIST_RE);
    if (m) {
      k += 1;
      items.push({
        id: `${checklistId}-${k}`,
        children: splitMarkdownInline(m[2], ctx),
      });
    }
  }
  return { type: "checklist", checklistId, items };
}

function renderStepper(title: string, buf: string[], ctx: ParseCtx): BlockNode {
  const codeLines: string[] = [];
  let i = 0;
  while (i < buf.length && !buf[i].trim().startsWith("```")) i += 1;
  i += 1;
  while (i < buf.length && buf[i].trim() !== "```") {
    codeLines.push(buf[i]);
    i += 1;
  }

  const steps: StepperStep[] = [];
  for (const line of buf.slice(i + 1)) {
    if (!line.trim()) continue;
    const p = line.split("|");
    if (p.length < 4) {
      ctx.warnings.push(`${ctx.id}: bad stepper line: ${line}`);
      continue;
    }
    const p0 = p[0].trim();
    const p1 = p[1].trim();
    const p2 = p[2].trim();
    const p3 = p.slice(3).join("|").trim();

    const lines: number[] = [];
    for (const part of p0.split(",")) {
      const trimmed = part.trim();
      if (trimmed.includes("-")) {
        const [aStr, bStr] = trimmed.split("-");
        const a = Number(aStr);
        const b = Number(bStr);
        for (let ln = a; ln <= b; ln++) lines.push(ln);
      } else if (trimmed && trimmed !== "0") {
        lines.push(Number(trimmed));
      }
    }

    const stack: StepperStackEntry[] = [];
    let frame = "main";
    if (p1 !== "-" && p1 !== "") {
      for (const ent of p1.split(";")) {
        const m = ent.match(/^\s*(?:\[(.+?)\]\s*)?(.+?)\s*=\s*(.*?)(?:\s*!(\w+))?\s*$/);
        if (!m) {
          ctx.warnings.push(`${ctx.id}: bad stack entry: ${ent}`);
          continue;
        }
        if (m[1]) frame = m[1];
        stack.push({
          frame,
          name: m[2],
          value: m[3],
          state: m[4] ?? "",
        });
      }
    }

    const heap: StepperHeapEntry[] = [];
    if (p2 !== "-" && p2 !== "") {
      for (const ent of p2.split(";")) {
        const m = ent.match(/^\s*#(\d+)\s*=\s*(.*?)(?:\s*!(\w+))?\s*$/);
        if (!m) {
          ctx.warnings.push(`${ctx.id}: bad heap entry: ${ent}`);
          continue;
        }
        heap.push({
          id: Number(m[1]),
          value: m[2],
          state: m[3] ?? "",
        });
      }
    }

    steps.push({
      lines,
      stack,
      heap,
      note: splitMarkdownInline(p3, ctx),
    });
  }

  return {
    type: "stepper",
    title: splitMarkdownInline(title, ctx),
    code: codeLines.join("\n"),
    steps,
  };
}

function renderGlossaryDirective(buf: string[], ctx: ParseCtx): BlockNode {
  const rawEntries: { term: string; def: string }[] = [];
  for (const line of buf) {
    const idx = line.indexOf("::");
    if (idx >= 0) {
      rawEntries.push({
        term: line.slice(0, idx).trim(),
        def: line.slice(idx + 2).trim(),
      });
    }
  }
  rawEntries.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));
  return {
    type: "glossary",
    entries: rawEntries.map((e) => {
      const term = splitMarkdownInline(e.term, ctx);
      const definition = splitMarkdownInline(e.def, ctx);
      return {
        term,
        definition,
        plainTerm: inlinePlainText(term).toLowerCase(),
        plainDef: inlinePlainText(definition).toLowerCase(),
      };
    }),
  };
}

function renderDirective(head: string, buf: string[], ctx: ParseCtx): BlockNode[] {
  const sp = head.indexOf(" ");
  const kind = (sp >= 0 ? head.slice(0, sp) : head).trim();
  const title = (sp >= 0 ? head.slice(sp + 1) : "").trim();

  if (kind in CALLOUT_LABELS) {
    return [
      {
        type: "callout",
        kind: kind as CalloutKind,
        title: title ? splitMarkdownInline(title, ctx) : undefined,
        blocks: parseBlocks(buf, ctx),
      },
    ];
  }
  if (kind === "details") {
    return [
      {
        type: "details",
        title: splitMarkdownInline(title, ctx),
        blocks: parseBlocks(buf, ctx),
      },
    ];
  }
  if (kind === "quiz") return [renderQuiz(title, buf, ctx)];
  if (kind === "exercise") return [renderExercise(title, buf, ctx)];
  if (kind === "checklist") return [renderChecklist(buf, ctx)];
  if (kind === "stepper") return [renderStepper(title, buf, ctx)];
  if (kind === "glossary") return [renderGlossaryDirective(buf, ctx)];

  ctx.warnings.push(`${ctx.id}: unknown directive :::${kind}`);
  return parseBlocks(buf, ctx);
}

function parseBlocks(lines: string[], ctx: ParseCtx): BlockNode[] {
  const out: BlockNode[] = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const raw = lines[i];
    const s = raw.trim();
    if (!s) {
      i += 1;
      continue;
    }

    if (s.startsWith("```")) {
      const info = s.slice(3).trim();
      const buf: string[] = [];
      let j = i + 1;
      while (j < n && lines[j].trim() !== "```") {
        buf.push(lines[j]);
        j += 1;
      }
      if (j >= n) {
        ctx.warnings.push(`${ctx.id}: unclosed code fence (${info})`);
      }
      out.push(renderCode(info, buf, ctx));
      i = j + 1;
      continue;
    }

    if (s.startsWith(":::") && s.length > 3) {
      const head = s.slice(3).trim();
      let depth = 1;
      let j = i + 1;
      const buf: string[] = [];
      let fence = false;
      while (j < n) {
        const t = lines[j].trim();
        if (t.startsWith("```")) {
          fence = !fence;
        } else if (!fence) {
          if (t === ":::") {
            depth -= 1;
            if (depth === 0) break;
          } else if (t.startsWith(":::")) {
            depth += 1;
          }
        }
        buf.push(lines[j]);
        j += 1;
      }
      if (j >= n) {
        ctx.warnings.push(`${ctx.id}: unclosed directive (${head})`);
      }
      out.push(...renderDirective(head, buf, ctx));
      i = j + 1;
      continue;
    }

    const hm = s.match(/^(#{2,4})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length as 2 | 3 | 4;
      const rawText = hm[2];
      const base = slugify(rawText);
      let slug = base;
      let k = 2;
      while (ctx.slugs.has(slug)) {
        slug = `${base}-${k}`;
        k += 1;
      }
      ctx.slugs.add(slug);
      const hid = `${ctx.id}--${slug}`;
      const children = splitMarkdownInline(rawText, ctx);
      const text = inlinePlainText(children);
      ctx.headings.push({ id: hid, level, text });
      out.push({ type: "heading", level, id: hid, text, children });
      i += 1;
      continue;
    }

    if (s === "---") {
      out.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (s.startsWith("|")) {
      const rows: string[] = [];
      let j = i;
      while (j < n && lines[j].trim().startsWith("|")) {
        rows.push(lines[j].trim());
        j += 1;
      }
      out.push(renderTable(rows, ctx));
      i = j;
      continue;
    }

    if (LIST_RE.test(raw)) {
      const buf: string[] = [];
      let j = i;
      while (
        j < n &&
        lines[j].trim() &&
        (LIST_RE.test(lines[j]) || lines[j].startsWith("  "))
      ) {
        buf.push(lines[j]);
        j += 1;
      }
      out.push(renderList(buf, ctx));
      i = j;
      continue;
    }

    if (s.startsWith("> ")) {
      const buf: string[] = [];
      let j = i;
      while (j < n && lines[j].trim().startsWith(">")) {
        buf.push(lines[j].trim().slice(1).trimStart());
        j += 1;
      }
      out.push({ type: "blockquote", blocks: parseBlocks(buf, ctx) });
      i = j;
      continue;
    }

    const buf = [s];
    let j = i + 1;
    while (j < n && lines[j].trim() && !isBlockStart(lines[j])) {
      buf.push(lines[j].trim());
      j += 1;
    }
    out.push({
      type: "paragraph",
      children: splitMarkdownInline(buf.join(" "), ctx),
    });
    i = j;
  }

  return out;
}

function collectSearchEntries(
  blocks: BlockNode[],
  ch: RawChapter,
  out: SearchEntry[],
  curHeading: { anchor: string; text: string }
): void {
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        if (b.level === 2 || b.level === 3) {
          curHeading.anchor = b.id;
          curHeading.text = b.text;
          out.push({
            chapterId: ch.id,
            num: ch.num,
            chapterTitle: ch.title,
            anchor: b.id,
            heading: b.text,
            text: b.text,
            lower: b.text.toLowerCase(),
            weight: 20,
          });
        }
        break;
      case "paragraph": {
        const text = inlinePlainText(b.children);
        if (text.length >= 3) {
          out.push({
            chapterId: ch.id,
            num: ch.num,
            chapterTitle: ch.title,
            anchor: curHeading.anchor,
            heading: curHeading.text,
            text,
            lower: text.toLowerCase(),
            weight: 8,
          });
        }
        break;
      }
      case "code":
        if (b.code.length >= 3) {
          out.push({
            chapterId: ch.id,
            num: ch.num,
            chapterTitle: ch.title,
            anchor: curHeading.anchor,
            heading: curHeading.text,
            text: b.code,
            lower: b.code.toLowerCase(),
            weight: 4,
          });
        }
        break;
      case "table":
        for (const row of [b.headers, ...b.rows]) {
          for (const cell of row) {
            const text = inlinePlainText(cell);
            if (text.length >= 3) {
              out.push({
                chapterId: ch.id,
                num: ch.num,
                chapterTitle: ch.title,
                anchor: curHeading.anchor,
                heading: curHeading.text,
                text,
                lower: text.toLowerCase(),
                weight: 8,
              });
            }
          }
        }
        break;
      case "list":
        for (const item of b.items) {
          const text = inlinePlainText(item.children);
          if (text.length >= 3 && item.blocks.length === 0) {
            out.push({
              chapterId: ch.id,
              num: ch.num,
              chapterTitle: ch.title,
              anchor: curHeading.anchor,
              heading: curHeading.text,
              text,
              lower: text.toLowerCase(),
              weight: 8,
            });
          }
          collectSearchEntries(item.blocks, ch, out, curHeading);
        }
        break;
      case "blockquote":
      case "callout":
      case "details":
        collectSearchEntries(b.blocks, ch, out, curHeading);
        break;
      case "exercise":
        collectSearchEntries(b.body, ch, out, curHeading);
        if (b.hint) collectSearchEntries(b.hint, ch, out, curHeading);
        if (b.solution) collectSearchEntries(b.solution, ch, out, curHeading);
        break;
      case "glossary":
        for (const entry of b.entries) {
          const term = inlinePlainText(entry.term);
          const def = inlinePlainText(entry.definition);
          out.push({
            chapterId: ch.id,
            num: ch.num,
            chapterTitle: ch.title,
            anchor: curHeading.anchor,
            heading: curHeading.text,
            text: `${term}: ${def}`,
            lower: `${term}: ${def}`.toLowerCase(),
            weight: 10,
          });
        }
        break;
      default:
        break;
    }
  }
}

let cachedGuide: LoadedGuide | null = null;

export function loadGuide(forceReload = false): LoadedGuide {
  if (cachedGuide && !forceReload && process.env.NODE_ENV === "production") {
    return cachedGuide;
  }

  const files = fs
    .readdirSync(CHAPTERS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const rawChapters: RawChapter[] = files.map((file) => {
    const rawLines = fs
      .readFileSync(path.join(CHAPTERS_DIR, file), "utf8")
      .split("\n");
    const meta: Record<string, string> = {};
    let i = 0;
    while (i < rawLines.length && rawLines[i].startsWith("@")) {
      const sp = rawLines[i].indexOf(" ");
      const k = (sp >= 0 ? rawLines[i].slice(1, sp) : rawLines[i].slice(1)).trim();
      const v = (sp >= 0 ? rawLines[i].slice(sp + 1) : "").trim();
      meta[k] = v;
      i += 1;
    }
    if (!meta.id || !meta.title || !meta.part) {
      throw new Error(`${file}: needs @id, @title and @part`);
    }
    return {
      id: meta.id,
      part: meta.part,
      title: meta.title,
      short: meta.short || meta.title,
      level: (meta.level || "beginner") as ChapterLevel,
      kind: (meta.kind || "chapter") as ChapterKind,
      time: meta.time && /^\d+$/.test(meta.time) ? Number(meta.time) : 0,
      learn: meta.learn ? meta.learn.split("|").map((x) => x.trim()) : [],
      num: "",
      file,
      lines: rawLines.slice(i),
    };
  });

  const partOrder: Record<string, number> = {};
  RAW_PARTS.forEach((p, idx) => {
    partOrder[p.key] = idx;
  });

  rawChapters.sort((a, b) => {
    const pd = (partOrder[a.part] ?? 999) - (partOrder[b.part] ?? 999);
    if (pd !== 0) return pd;
    return a.file.localeCompare(b.file);
  });

  const knownIds = new Set<string>();
  const nums: Record<string, string> = {};
  let num = 0;
  let letter = 0;
  let projectCount = 0;

  for (const ch of rawChapters) {
    knownIds.add(ch.id);
    if (ch.kind === "appendix") {
      ch.num = "ABCDEFGHIJ"[letter] ?? String(letter + 1);
      letter += 1;
    } else if (ch.part === "welcome") {
      ch.num = "0";
    } else {
      num += 1;
      ch.num = String(num).padStart(2, "0");
    }
    nums[ch.id] = ch.num;
    if (ch.kind === "project") projectCount += 1;
  }

  // First pass: load raw glossary entries from glossary chapter
  const rawGlossary: { key: string; term: string; def: string }[] = [];
  const glossaryMap: Record<string, GlossaryEntry> = {};
  for (const ch of rawChapters) {
    if (ch.id !== "glossary") continue;
    let inside = false;
    for (const line of ch.lines) {
      const t = line.trim();
      if (t.startsWith(":::glossary")) inside = true;
      else if (t === ":::") inside = false;
      else if (inside && line.includes("::")) {
        const idx = line.indexOf("::");
        const term = line.slice(0, idx).trim();
        const def = line.slice(idx + 2).trim();
        const key = term.toLowerCase();
        rawGlossary.push({ key, term, def });
        glossaryMap[key] = {
          key,
          term,
          definitionMarkdown: def,
          definitionNodes: [],
          definitionPlain: def,
        };
      }
    }
  }

  const warnings: string[] = [];
  const links: { from: string; target: string }[] = [];
  const stats = {
    code: 0,
    exercises: 0,
    questions: 0,
    projects: projectCount,
  };

  // Second pass: parse definition inline nodes using full glossary + nums
  const glossaryCtx: ParseCtx = {
    id: "glossary",
    slugs: new Set(),
    headings: [],
    quiz: 0,
    ex: 0,
    check: 0,
    lastHash: "",
    glossary: glossaryMap,
    nums,
    links,
    warnings,
    stats,
  };
  for (const g of rawGlossary) {
    const nodes = splitMarkdownInline(g.def, glossaryCtx);
    glossaryMap[g.key].definitionNodes = nodes;
    glossaryMap[g.key].definitionPlain = inlinePlainText(nodes);
  }

  // Part metadata
  let partNum = 0;
  const parts: PartMeta[] = RAW_PARTS.map((p) => {
    if (p.key.startsWith("p")) {
      partNum += 1;
      return {
        ...p,
        partLabel: `Part ${partNum}`,
        partTitle: `Part ${partNum} · ${p.title}`,
      };
    }
    return {
      ...p,
      partLabel: "",
      partTitle: p.title,
    };
  });
  const partTitleMap: Record<string, string> = {};
  for (const p of parts) {
    partTitleMap[p.key] = p.partTitle;
  }

  const summaries: ChapterSummary[] = rawChapters.map((ch) => ({
    id: ch.id,
    num: ch.num,
    part: ch.part,
    partTitle: partTitleMap[ch.part],
    kind: ch.kind,
    level: ch.level,
    title: typo(ch.title),
    short: typo(ch.short),
    time: ch.time,
    learn: ch.learn,
    file: ch.file,
  }));

  const chapters: ChapterData[] = rawChapters.map((ch, idx) => {
    const ctx: ParseCtx = {
      id: ch.id,
      slugs: new Set(),
      headings: [],
      quiz: 0,
      ex: 0,
      check: 0,
      lastHash: "",
      glossary: glossaryMap,
      nums,
      links,
      warnings,
      stats,
    };
    const blocks = parseBlocks(ch.lines, ctx);
    const learnNodes = ch.learn.map((item) => splitMarkdownInline(item, ctx));
    const summary = summaries[idx];
    return {
      ...summary,
      learnNodes,
      blocks,
      headings: ctx.headings,
      prev: idx > 0 ? summaries[idx - 1] : null,
      next: idx + 1 < summaries.length ? summaries[idx + 1] : null,
    };
  });

  // Validate internal chapter links and learning routes
  for (const link of links) {
    if (!knownIds.has(link.target) && link.target !== "home") {
      warnings.push(`${link.from}: link to unknown chapter #${link.target}`);
    }
  }
  for (const rt of ROUTES) {
    if (rt.chapters) {
      for (const cid of rt.chapters) {
        if (!knownIds.has(cid)) {
          warnings.push(`route ${rt.id}: unknown chapter #${cid}`);
        }
      }
    }
  }

  // Build search index across all chapters
  const searchIndex: SearchEntry[] = [];
  for (let i = 0; i < rawChapters.length; i++) {
    const raw = rawChapters[i];
    const ch = chapters[i];
    searchIndex.push({
      chapterId: ch.id,
      num: ch.num,
      chapterTitle: ch.title,
      anchor: "",
      heading: "",
      text: ch.title,
      lower: ch.title.toLowerCase(),
      weight: 30,
    });
    collectSearchEntries(ch.blocks, raw, searchIndex, { anchor: "", text: "" });
  }

  const chapterMap: Record<string, ChapterData> = {};
  for (const ch of chapters) chapterMap[ch.id] = ch;

  const tracked = summaries.filter((c) => c.kind !== "appendix");
  const totalMinutes = tracked.reduce((acc, c) => acc + c.time, 0);

  const guide: LoadedGuide = {
    parts,
    routes: ROUTES,
    chapters,
    chapterMap,
    summaries,
    glossary: glossaryMap,
    stats: {
      totalChapters: chapters.length,
      trackedChapters: tracked.length,
      codeBlocks: stats.code,
      exercises: stats.exercises,
      questions: stats.questions,
      projects: stats.projects,
      totalMinutes,
    },
    searchIndex,
    warnings,
  };

  if (process.env.NODE_ENV === "production") {
    cachedGuide = guide;
  }
  return guide;
}

export function loadChapter(id: string): ChapterData | undefined {
  return loadGuide().chapterMap[id];
}
