import { createHighlighter, type Highlighter } from "shiki";

const SHIKI_LANG_MAP: Record<string, string> = {
  rust: "rust",
  toml: "toml",
  c: "c",
  cpp: "cpp",
  json: "json",
  sql: "sql",
  html: "html",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  yaml: "yaml",
  java: "java",
  go: "go",
  dockerfile: "dockerfile",
  docker: "dockerfile",
  css: "css",
  protobuf: "proto",
  proto: "proto",
  asm: "asm",
  llvm: "llvm",
  diff: "diff",
};

const LOADED_LANGS = [
  "rust",
  "toml",
  "c",
  "cpp",
  "json",
  "sql",
  "html",
  "python",
  "javascript",
  "typescript",
  "yaml",
  "java",
  "go",
  "dockerfile",
  "css",
  "proto",
  "asm",
  "llvm",
  "diff",
];

const globalForShiki = globalThis as unknown as {
  __rustGuideHighlighter?: Promise<Highlighter>;
};

export function getHighlighter(): Promise<Highlighter> {
  if (!globalForShiki.__rustGuideHighlighter) {
    globalForShiki.__rustGuideHighlighter = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: LOADED_LANGS,
    });
  }
  return globalForShiki.__rustGuideHighlighter;
}

export function escHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlightShell(code: string): string {
  const lines = code.split("\n").map((line) => {
    if (line.startsWith("$ ")) {
      const rest = line.slice(2);
      const commentIdx = rest.indexOf("  # ");
      if (commentIdx >= 0) {
        const cmd = rest.slice(0, commentIdx);
        const comment = rest.slice(commentIdx);
        return `<span class="sh-pr">$ </span><span class="sh-cmd" data-cmd="1">${escHtml(cmd)}</span><span class="sh-c">${escHtml(comment)}</span>`;
      }
      return `<span class="sh-pr">$ </span><span class="sh-cmd" data-cmd="1">${escHtml(rest)}</span>`;
    }
    if (line.startsWith("# ")) {
      return `<span class="sh-c">${escHtml(line)}</span>`;
    }
    return `<span class="sh-o">${escHtml(line)}</span>`;
  });
  return `<pre class="code-pre"><code>${lines.join("\n")}</code></pre>`;
}

function highlightCompilerError(code: string): string {
  const lines = code.split("\n").map((raw) => {
    let e = escHtml(raw);
    e = e.replace(
      /^(error(?:\[E\d+\])?)(:?)/,
      '<span class="err-er">$1</span>$2'
    );
    e = e.replace(/^(warning)(:?)/, '<span class="err-wr">$1</span>$2');
    e = e.replace(
      /^(\s*=?\s*)(help|note)(:)/,
      '$1<span class="err-hl">$2</span>$3'
    );
    e = e.replace(
      /^(\s*(?:\d+)?\s*\|\s*)((?:[\^]+|-{2,}|\|)[^\n]*)$/,
      (_, prefix: string, marker: string) =>
        prefix +
        `<span class="${marker.includes("^") ? "err-er" : "err-hl"}">${marker}</span>`
    );
    e = e.replace(/^(\s*)(--&gt;)/, '$1<span class="err-hl">$2</span>');
    return e;
  });
  return `<pre class="code-pre"><code>${lines.join("\n")}</code></pre>`;
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  if (lang === "sh") return highlightShell(code);
  if (lang === "error") return highlightCompilerError(code);
  const shikiLang = SHIKI_LANG_MAP[lang];
  if (!shikiLang) {
    return `<pre class="code-pre"><code>${escHtml(code)}</code></pre>`;
  }
  const h = await getHighlighter();
  return h.codeToHtml(code, {
    lang: shikiLang,
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultColor: false,
  });
}

export async function highlightRustLines(code: string): Promise<string[]> {
  const h = await getHighlighter();
  const tokens = h.codeToTokens(code, {
    lang: "rust",
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultColor: false,
  });
  return tokens.tokens.map((lineTokens) =>
    lineTokens
      .map((tok) => {
        const light = tok.htmlStyle?.["--shiki-light"];
        const dark = tok.htmlStyle?.["--shiki-dark"];
        const styleParts: string[] = [];
        if (light) styleParts.push(`--shiki-light:${light}`);
        if (dark) styleParts.push(`--shiki-dark:${dark}`);
        const styleAttr =
          styleParts.length > 0 ? ` style="${styleParts.join(";")}"` : "";
        return `<span${styleAttr}>${escHtml(tok.content)}</span>`;
      })
      .join("")
  );
}
