#!/usr/bin/env python3
"""Builds rust-guide.html (one self-contained file) from chapters/*.md.

Usage:  python3 tools/build.py
The chapter format is a small Markdown dialect, documented in README.md.
"""
import hashlib
import html
import json
import os
import re
import sys
from pathlib import Path

from pygments.lexers import get_lexer_by_name
from pygments.token import Token

ROOT = Path(__file__).resolve().parent.parent
CHAPTERS = ROOT / "chapters"
ASSETS = ROOT / "assets"
OUT = ROOT.parent / "rust-guide.html"
CAPTURED = ROOT / "captured"

PARTS = [
    ("welcome", "Start here", "", ""),
    ("p1", "First steps", "Beginner",
     "What programming is, how to install Rust, and the building blocks every program is made of: values, functions, decisions and loops."),
    ("p2", "Ownership: Rust's big idea", "Beginner",
     "How computers store data, and the one rule set that lets Rust be both safe and fast: ownership, borrowing and slices."),
    ("p3", "Modelling data", "Beginner",
     "Describe real things in code with structs and enums, take them apart with pattern matching, and store many of them in collections."),
    ("p4", "Building bigger programs", "Intermediate",
     "Organise code into modules, handle errors properly, and write flexible, reusable code with generics, traits and lifetimes. Then prove it works with tests."),
    ("p5", "Functional style", "Intermediate",
     "Closures and iterators: short, expressive code that runs as fast as hand-written loops."),
    ("p6", "Memory and types mastery", "Intermediate",
     "Smart pointers for sharing and shaping data, and a deeper look at Rust's type system."),
    ("p7", "Concurrency", "Advanced",
     "Do many things at once without fear: threads, channels, shared state and async/await."),
    ("p8", "Advanced Rust", "Advanced",
     "Macros, unsafe code, talking to other languages, memory layout, and the idioms experienced Rust developers rely on."),
    ("p9", "Tooling", "Intermediate",
     "Cargo, Clippy, rustfmt, rust-analyzer, debugging, profiling and professional testing strategies."),
    ("p10", "The ecosystem", "Intermediate",
     "The libraries and frameworks real projects are built from: Serde, Tokio, Clap, Axum, SQLx, Tauri, Bevy and many more."),
    ("p11", "Becoming a Rust developer", "Advanced",
     "Performance, a full capstone project, and a plan for what to do after this guide."),
    ("app", "Appendices", "", "Glossary, cheat sheets and reference tables to keep open while you code."),
]
LEVELS = {"beginner": "Beginner", "intermediate": "Intermediate", "advanced": "Advanced", "all": "All levels"}

warnings = []
stats = {"code": 0, "exercises": 0, "questions": 0, "projects": 0}
GLOSSARY = {}        # lower-case term -> (term, definition html)
KNOWN_IDS = set()    # chapter ids
NUMS = {}            # chapter id -> displayed number
LINKS = []           # (from chapter, target chapter id) for validation


def warn(msg):
    warnings.append(msg)


def esc(s):
    return html.escape(s, quote=False)


def attr(s):
    return html.escape(s, quote=True)


def icon(name, cls=""):
    return f'<svg class="i {cls}" aria-hidden="true"><use href="#i-{name}"/></svg>'


def slugify(text):
    text = re.sub(r"`|\*|\[|\]", "", text.lower())
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "section"


# ───────────────────────── inline markup ─────────────────────────

OPENERS = set(" \t\n([{—–-/\x01")


def typo(s):
    """Typographic quotes and dashes for prose (never applied to code)."""
    s = s.replace(" -- ", " — ").replace("...", "…")
    out = []
    n = len(s)
    for i, ch in enumerate(s):
        if ch not in "\"'":
            out.append(ch)
            continue
        prev = s[i - 1] if i else ""
        nxt = s[i + 1] if i + 1 < n else ""
        opening = prev == "" or prev in OPENERS
        if ch == '"':
            out.append("“" if opening else "”")
        else:
            if prev.isalnum() or not opening:
                out.append("’")
            else:
                out.append("‘" if nxt.isalnum() else "’")
    return "".join(out)


def inline(text, ctx=None):
    stash = []

    def keep(h, opener=False):
        stash.append(h)
        mark = "\x01" if opener else "\x00"
        return f"{mark}{len(stash) - 1}{mark}"

    text = re.sub(r"`([^`\n]+)`", lambda m: keep("<code>" + esc(m.group(1)) + "</code>"), text)
    text = re.sub(r"\\([*_\[\]`|{}\\#:<>])", lambda m: keep(esc(m.group(1))), text)
    text = re.sub(r"\{\{(.+?)\}\}", lambda m: keep("<kbd>" + esc(m.group(1)) + "</kbd>"), text)

    def term(m):
        shown, _, key = m.group(1).partition("|")
        key = (key or shown).strip().lower()
        if key not in GLOSSARY:
            warn(f"glossary term not found: [[{m.group(1)}]]")
            return shown
        return (keep(f'<span class="term" tabindex="0" role="button" data-term="{attr(key)}">', True)
                + shown + keep("</span>"))

    text = re.sub(r"\[\[(.+?)\]\]", term, text)

    def link(m):
        label, target = m.group(1), m.group(2)
        if target.startswith("#"):
            cid, _, anchor = target[1:].partition("/")
            if ctx is not None:
                LINKS.append((ctx.get("id", "?"), cid))
            a = f' data-anchor="{attr(anchor)}"' if anchor else ""
            mnum = re.fullmatch(r"([Cc])hapter \d+", label)
            if mnum and NUMS.get(cid, "").isdigit():
                label = f"{mnum.group(1)}hapter {int(NUMS[cid])}"   # keep cross-references correct automatically
            return keep(f'<a href="#{attr(cid)}" data-nav="{attr(cid)}"{a}>', True) + label + keep("</a>")
        return (keep(f'<a href="{attr(target)}" target="_blank" rel="noopener noreferrer" class="ext">', True)
                + label + keep("</a>"))

    text = re.sub(r"\[([^\]\n]+)\]\(([^)\s]+)\)", link, text)
    text = typo(esc(text))
    text = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])", r"<em>\1</em>", text)
    for _ in range(3):
        text = re.sub(r"[\x00\x01](\d+)[\x00\x01]", lambda m: stash[int(m.group(1))], text)
    return text


# ───────────────────────── code highlighting ─────────────────────────

RUST_KW = set("""as async await break const continue crate dyn else enum extern false fn for if impl in let
loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while
union""".split())
LEXERS = {"rust": "rust", "toml": "toml", "c": "c", "cpp": "cpp", "json": "json", "sql": "sql", "html": "html",
          "python": "python", "js": "javascript", "ts": "typescript", "yaml": "yaml", "java": "java", "go": "go",
          "dockerfile": "docker", "css": "css"}
LANG_LABEL = {"rust": "Rust", "toml": "TOML", "sh": "Terminal", "c": "C", "cpp": "C++", "json": "JSON",
              "sql": "SQL", "html": "HTML", "python": "Python", "js": "JavaScript", "ts": "TypeScript",
              "yaml": "YAML", "java": "Java", "go": "Go", "text": "Text", "output": "Output",
              "error": "Compiler message", "dockerfile": "Dockerfile", "css": "CSS", "tree": "Folder layout"}


def classify(tt, v, lang, nextv):
    T = Token
    if tt in T.Comment.Preproc:
        return "a"
    if tt in T.Comment or tt in T.Literal.String.Doc:
        return "c"
    if tt in T.Literal.String:
        return "s"
    if tt in T.Literal.Number:
        return "n"
    if lang == "rust":
        if v in RUST_KW:
            return "k"
        if tt in T.Keyword.Pseudo:
            return ""
        if (tt in T.Operator and v == "'") or tt in T.Name.Attribute or tt in T.Name.Label:
            return "l"
        if tt in T.Name.Function.Magic:
            return "m"
        if tt in T.Keyword.Type:
            return "t"
        if tt in T.Keyword:
            return "k"
        if tt in T.Name.Function:
            return "f"
        if tt in T.Name:
            if nextv == "!":
                return "m"
            if re.fullmatch(r"[A-Z][A-Z0-9_]+", v):
                return "n"
            if re.fullmatch(r"[A-Z]\w*", v):
                return "t"
            if nextv == "(":
                return "f"
        return ""
    if tt in T.Keyword.Type:
        return "t"
    if tt in T.Keyword or tt in T.Name.Tag:
        return "k"
    if tt in T.Name.Function:
        return "f"
    if tt in T.Name.Class or tt in T.Name.Builtin:
        return "t"
    if tt in T.Name.Attribute or tt in T.Name.Variable:
        return "l"
    return ""


def highlight(code, lang):
    if lang == "sh":
        out = []
        for line in code.split("\n"):
            if line.startswith("$ "):
                cmd, sep, comment = line[2:].partition("  # ")
                c = f'<span class="c">{esc(sep + comment)}</span>' if sep else ""
                out.append(f'<span class="pr">$ </span><span class="cmd">{esc(cmd)}</span>{c}')
            elif line.startswith("# "):
                out.append(f'<span class="c">{esc(line)}</span>')
            else:
                out.append(f'<span class="o">{esc(line)}</span>')
        return "\n".join(out)
    if lang == "error":
        out = []
        for line in code.split("\n"):
            e = esc(line)
            e = re.sub(r"^(error(?:\[E\d+\])?)(:?)", r'<span class="er">\1</span>\2', e)
            e = re.sub(r"^(warning)(:?)", r'<span class="wr">\1</span>\2', e)
            e = re.sub(r"^(\s*=?\s*)(help|note)(:)", r'\1<span class="hl">\2</span>\3', e)
            e = re.sub(r"^(\s*(?:\d+)?\s*\|\s*)((?:[\^]+|-{2,}|\|)[^\n]*)$",
                       lambda m: m.group(1) + ('<span class="er">' if "^" in m.group(2) else '<span class="hl">')
                       + m.group(2) + "</span>", e)
            e = re.sub(r"^(\s*)(--&gt;)", r'\1<span class="hl">\2</span>', e)
            out.append(e)
        return "\n".join(out)
    if lang not in LEXERS:
        return esc(code)
    lexer = get_lexer_by_name(LEXERS[lang], stripnl=False, ensurenl=False)
    toks = [(tt, v) for tt, v in lexer.get_tokens(code) if v != ""]
    out, cur_cls, cur = [], None, []

    def flush():
        if cur:
            text = esc("".join(cur))
            out.append(f'<span class="{cur_cls}">{text}</span>' if cur_cls else text)

    for i, (tt, v) in enumerate(toks):
        nextv = toks[i + 1][1] if i + 1 < len(toks) else ""
        c = classify(tt, v, lang, nextv)
        if c != cur_cls:
            flush()
            cur_cls, cur = c, []
        cur.append(v)
    flush()
    return "".join(out)


CHECK_FLAGS = ("run", "wrap", "check", "fail", "panic", "test", "ext", "warns")
SOFT_WRAP_AT = 100


def visible_rust(lines):
    out = []
    for l in lines:
        st = l.lstrip()
        if st == "#" or st.startswith("# "):
            continue
        if st.startswith("## "):
            l = l.replace("## ", "# ", 1)
        out.append(l)
    return out


def render_flame(caption, lines, ctx):
    """```flame Caption``` — a flame graph drawn with nested boxes. One line per function:
    `label | percent of the total [| full name for the tooltip]`, callees indented by two spaces below their caller.
    app.js zooms in on a clicked bar (zoomFlame)."""
    root = {"kids": [], "pct": 100.0}
    stack = [(-1, root)]
    for raw in lines:
        if not raw.strip():
            continue
        depth = (len(raw) - len(raw.lstrip(" "))) // 2
        fields = [f.strip() for f in raw.strip().split("|")]
        try:
            node = {"label": fields[0], "pct": float(fields[1]), "kids": [],
                    "long": fields[2] if len(fields) > 2 else fields[0]}
        except (ValueError, IndexError):
            warn(f"{ctx['id']}: bad flame line {raw!r}")
            continue
        while stack[-1][0] >= depth:
            stack.pop()
        stack[-1][1]["kids"].append(node)
        stack.append((depth, node))

    counter = [0]

    def draw(node, parent_pct):
        counter[0] += 1
        hue = 8 + (counter[0] * 23) % 40
        width = min(100.0, 100.0 * node["pct"] / parent_pct)
        pct = f'{node["pct"]:g} %'
        kids = "".join(draw(k, node["pct"]) for k in node["kids"])
        kids_html = f'<div class="fl-kids">{kids}</div>' if kids else ""
        return (f'<div class="fl-node" style="width:{width:.2f}%">'
                f'<button type="button" class="fl-bar" style="--fh:{hue}" '
                f'title="{attr(node["long"])}: {pct} of the running time">'
                f'{esc(node["label"])} <span class="fl-pct">{pct}</span></button>{kids_html}</div>')

    body = "".join(draw(k, 100.0) for k in root["kids"])
    cap = f'<figcaption>{inline(caption, ctx)}</figcaption>' if caption else ""
    return f'<figure class="flame"><div class="fl-scroll"><div class="fl-root">{body}</div></div>{cap}</figure>'


def render_code(info, lines, ctx):
    parts = info.split()
    lang = parts[0] if parts else "text"
    if lang == "flame":
        return render_flame(info.strip()[5:].strip(), lines, ctx)
    flags = parts[1:]
    title = ""
    for f in flags:
        if f.startswith("file="):
            title = f[5:]
    if title and "cont" in flags:
        title += " (continued)"
    kind = next((f for f in flags if f in CHECK_FLAGS), "")
    full = None
    if lang == "rust":
        ctx["last_hash"] = hashlib.sha1("\n".join(lines).encode()).hexdigest()[:16]
        hidden = any(l.strip() == "#" or l.lstrip().startswith("# ") for l in lines)
        if kind in ("run", "wrap") and (hidden or kind == "wrap") and "ext" not in flags:
            src = []
            for l in lines:
                st = l.lstrip()
                if st == "#":
                    src.append("")
                elif st.startswith("# "):
                    src.append(l.replace("# ", "", 1))
                elif st.startswith("## "):
                    src.append(l.replace("## ", "# ", 1))
                else:
                    src.append(l)
            full = "\n".join(src).strip("\n")
            if kind == "wrap":
                full = "fn main() {\n" + "\n".join(("    " + l) if l.strip() else "" for l in full.split("\n")) + "\n}"
        lines = visible_rust(lines)
    if lang in ("output", "error") and "auto" in flags:
        cap = CAPTURED / (ctx.get("last_hash", "none") + ".txt")
        if cap.exists():
            lines = cap.read_text(encoding="utf-8").rstrip("\n").split("\n")
            for f in flags:
                if f.startswith("lines=") and len(lines) > int(f[6:]):
                    lines = lines[:int(f[6:])] + ["..."]
        else:
            warn(f"{ctx['id']}: no captured text for an `auto` block yet (run tools/check.py)")
            lines = ["(run tools/check.py to fill this in)"]
    code = "\n".join(lines).strip("\n")
    body = highlight(code, lang)
    label = LANG_LABEL.get(lang, lang.upper())
    cls = ["code", f"lang-{lang}"]
    # Terminal sessions and program output with very long lines wrap like a terminal does.
    # Diagrams and aligned tables (box-drawing characters) keep their shape and scroll instead.
    if "soft" in flags or (lang in ("text", "output") and "nosoft" not in flags and lines
                           and max(len(l) for l in lines) > SOFT_WRAP_AT
                           and not any(ch in l for l in lines for ch in "─│┌┐└┘├┤┬┴┼▲▼◄►")):
        cls.append("soft")
        if os.environ.get("SHOW_SOFT"):
            longest = max(lines, key=len)
            print(f"soft: {ctx['id']:<22} {lang:<6} {len(longest):>4}  {longest[:70]}")
    badges = ""
    actions = ""
    if lang in ("output", "error"):
        cls.append("out" if lang == "output" else "err")
        if "panic" in flags:
            label = "Output (the program crashed)"
    else:
        stats["code"] += 1
        actions = f'<button type="button" class="cbtn btn-copy" title="Copy this code">{icon("copy")}<span>Copy</span></button>'
    if kind == "fail":
        cls.append("fail")
        badges = '<span class="badge bad">Does not compile — on purpose</span>'
    elif kind == "panic":
        cls.append("fail")
        badges = '<span class="badge bad">Compiles, but crashes when run — on purpose</span>'
    if lang == "rust" and (kind in ("run", "wrap") or (kind == "panic" and "fn main" in code)) and "ext" not in flags \
            and "noplay" not in flags:
        actions += (f'<button type="button" class="cbtn btn-run" title="Open this example in the online Rust '
                    f'Playground">{icon("play")}<span>Run</span></button>')
    file_html = f'<span class="code-file">{esc(title)}</span>' if title else ""
    head = (f'<figcaption class="code-head"><span class="code-lang">{label}</span>{file_html}{badges}'
            f'<span class="code-actions">{actions}</span></figcaption>')
    if lang == "rust" and "release" in flags:
        cls.append("rel")
    data_full = f' data-full="{attr(full)}"' if full else ""
    return f'<figure class="{" ".join(cls)}"{data_full}>{head}<pre><code>{body}</code></pre></figure>'


# ───────────────────────── block markup ─────────────────────────

LIST_RE = re.compile(r"^([-*]|\d+\.)\s+(.*)$")


def is_block_start(line):
    s = line.strip()
    return (s.startswith("```") or s.startswith(":::") or s.startswith("|") or s.startswith("> ")
            or bool(re.match(r"^#{2,4}\s", s)) or bool(LIST_RE.match(s)) or s == "---")


def split_row(row):
    row = row.strip()
    if row.startswith("|"):
        row = row[1:]
    if row.endswith("|") and not row.endswith("\\|"):
        row = row[:-1]
    cells, cur, in_code, i = [], "", False, 0
    while i < len(row):
        ch = row[i]
        if ch == "`":
            in_code = not in_code
            cur += ch
        elif ch == "\\" and i + 1 < len(row) and row[i + 1] == "|":
            cur += "|"
            i += 1
        elif ch == "|" and not in_code:
            cells.append(cur.strip())
            cur = ""
        else:
            cur += ch
        i += 1
    cells.append(cur.strip())
    return cells


def render_table(rows, ctx):
    head = split_row(rows[0])
    body = rows[2:] if len(rows) > 1 and re.match(r"^\|[\s:|-]+\|?$", rows[1]) else rows[1:]
    h = "".join(f"<th>{inline(c, ctx)}</th>" for c in head)
    b = ""
    for r in body:
        b += "<tr>" + "".join(f"<td>{inline(c, ctx)}</td>" for c in split_row(r)) + "</tr>"
    return f'<div class="table-wrap"><table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


def render_list(buf, ctx):
    ordered = bool(re.match(r"^\d+\.", buf[0]))
    items = []
    for line in buf:
        m = LIST_RE.match(line)
        if m and not line.startswith(" "):
            items.append([m.group(2), []])
        else:
            items[-1][1].append(line)
    out = []
    for text, sub in items:
        subhtml = ""
        if sub:
            ind = min(len(l) - len(l.lstrip()) for l in sub if l.strip())
            sub = [l[ind:] for l in sub]
            k = 0
            while k < len(sub) and not is_block_start(sub[k]):
                text += " " + sub[k].strip()
                k += 1
            if k < len(sub):
                subhtml = parse_blocks(sub[k:], ctx)
        out.append("<li>" + inline(text, ctx) + subhtml + "</li>")
    tag = "ol" if ordered else "ul"
    return f"<{tag}>" + "".join(out) + f"</{tag}>"


def parse_blocks(lines, ctx):
    out = []
    i, n = 0, len(lines)
    while i < n:
        raw = lines[i]
        s = raw.strip()
        if not s:
            i += 1
            continue
        if s.startswith("```"):
            info = s[3:].strip()
            j, buf = i + 1, []
            while j < n and lines[j].strip() != "```":
                buf.append(lines[j])
                j += 1
            if j >= n:
                warn(f"{ctx['id']}: unclosed code fence ({info})")
            out.append(render_code(info, buf, ctx))
            i = j + 1
            continue
        if s.startswith(":::") and len(s) > 3:
            head = s[3:].strip()
            depth, j, buf, fence = 1, i + 1, [], False
            while j < n:
                t = lines[j].strip()
                if t.startswith("```"):
                    fence = not fence
                elif not fence:
                    if t == ":::":
                        depth -= 1
                        if depth == 0:
                            break
                    elif t.startswith(":::"):
                        depth += 1
                buf.append(lines[j])
                j += 1
            if j >= n:
                warn(f"{ctx['id']}: unclosed directive ({head})")
            out.append(render_directive(head, buf, ctx))
            i = j + 1
            continue
        m = re.match(r"^(#{2,4})\s+(.+)$", s)
        if m:
            level = len(m.group(1))
            text = m.group(2)
            slug = slugify(text)
            base, k = slug, 2
            while slug in ctx["slugs"]:
                slug = f"{base}-{k}"
                k += 1
            ctx["slugs"].add(slug)
            hid = f'{ctx["id"]}--{slug}'
            out.append(f'<h{level} id="{hid}">{inline(text, ctx)}</h{level}>')
            i += 1
            continue
        if s == "---":
            out.append("<hr>")
            i += 1
            continue
        if s.startswith("|"):
            j, rows = i, []
            while j < n and lines[j].strip().startswith("|"):
                rows.append(lines[j].strip())
                j += 1
            out.append(render_table(rows, ctx))
            i = j
            continue
        if LIST_RE.match(raw):
            j, buf = i, []
            while j < n and lines[j].strip() and (LIST_RE.match(lines[j]) or lines[j].startswith("  ")):
                buf.append(lines[j])
                j += 1
            out.append(render_list(buf, ctx))
            i = j
            continue
        if s.startswith("> "):
            j, buf = i, []
            while j < n and lines[j].strip().startswith(">"):
                buf.append(lines[j].strip()[1:].lstrip())
                j += 1
            out.append("<blockquote>" + parse_blocks(buf, ctx) + "</blockquote>")
            i = j
            continue
        j, buf = i, [s]
        j += 1
        while j < n and lines[j].strip() and not is_block_start(lines[j]):
            buf.append(lines[j].strip())
            j += 1
        out.append("<p>" + inline(" ".join(buf), ctx) + "</p>")
        i = j
    return "\n".join(out)


# ───────────────────────── directives ─────────────────────────

CALLOUTS = {
    "analogy": ("bulb", "Real-world analogy"),
    "plain": ("chat", "In plain English"),
    "compare": ("scale", "How other languages do it"),
    "warn": ("alert", "Watch out"),
    "tip": ("spark", "Tip"),
    "note": ("info", "Good to know"),
    "key": ("key", "Key idea"),
    "recap": ("list", "Recap"),
}
EX_KINDS = {"guided": "Guided exercise", "practice": "Practice", "challenge": "Challenge"}


def render_quiz(title, buf, ctx):
    qs, cur, mode, fence = [], None, None, False
    for line in buf:
        s = line.rstrip()
        if s.strip().startswith("```"):
            fence = not fence
        if not fence and s.startswith("? "):
            cur = {"q": [s[2:]], "opts": [], "exp": []}
            qs.append(cur)
            mode = "q"
        elif cur is None:
            continue
        elif not fence and mode in ("q", "o") and re.match(r"^[-+] ", s):
            cur["opts"].append([s[0] == "+", s[2:]])
            mode = "o"
        elif not fence and s.startswith("= "):
            cur["exp"].append(s[2:])
            mode = "e"
        elif mode == "q":
            cur["q"].append(line)
        elif mode == "e":
            cur["exp"].append(line)
        elif mode == "o" and s.strip():
            cur["opts"][-1][1] += " " + s.strip()
    ctx["quiz"] += 1
    qid = f'{ctx["id"]}-q{ctx["quiz"]}'
    out = [f'<div class="quiz" data-quiz="{qid}"><div class="quiz-head">{icon("help")}'
           f'<span>{inline(title, ctx) if title else "Quick check"}</span><span class="quiz-score" aria-live="polite"></span>'
           f'<button type="button" class="quiz-reset" hidden>Try again</button></div>']
    for qi, q in enumerate(qs):
        stats["questions"] += 1
        if sum(1 for ok, _ in q["opts"] if ok) != 1:
            warn(f"{qid}: question {qi + 1} must have exactly one correct option")
        opts = ""
        for oi, (ok, text) in enumerate(q["opts"]):
            opts += (f'<button type="button" class="opt" data-ok="{1 if ok else 0}"><span class="key">'
                     f'{"ABCDEF"[oi]}</span><span>{inline(text, ctx)}</span></button>')
        out.append(f'<div class="q" data-q="{qi}"><div class="q-text"><span class="q-num">{qi + 1}</span>'
                   f'<div>{parse_blocks(q["q"], ctx)}</div></div><div class="q-opts">{opts}</div>'
                   f'<div class="q-exp" hidden><strong class="q-verdict"></strong> {parse_blocks(q["exp"], ctx)}</div></div>')
    out.append("</div>")
    return "".join(out)


def render_exercise(title, buf, ctx):
    kind, _, rest = title.partition(" ")
    if kind not in EX_KINDS:
        kind, rest = "practice", title
    body, hint, sol, mode = [], [], [], "body"
    for line in buf:
        t = line.strip()
        if t == "::hint":
            mode = "hint"
        elif t == "::solution":
            mode = "sol"
        else:
            {"body": body, "hint": hint, "sol": sol}[mode].append(line)
    ctx["ex"] += 1
    stats["exercises"] += 1
    xid = f'{ctx["id"]}-x{ctx["ex"]}'
    if not sol:
        warn(f"{xid}: exercise without a solution")
    h = (f'<details class="ex-more ex-hint"><summary>{icon("bulb")}Need a hint?</summary><div class="d-body">'
         f'{parse_blocks(hint, ctx)}</div></details>') if hint else ""
    s = (f'<details class="ex-more ex-sol"><summary>{icon("check")}Show solution and explanation</summary>'
         f'<div class="d-body">{parse_blocks(sol, ctx)}</div></details>') if sol else ""
    return (f'<div class="exercise" data-ex="{xid}"><div class="ex-head"><span class="ex-kind {kind}">'
            f'{icon("pencil")}{EX_KINDS[kind]}</span><span class="ex-title">{inline(rest, ctx)}</span>'
            f'<label class="ex-done"><input type="checkbox" data-save="{xid}"> Done</label></div>'
            f'<div class="ex-body">{parse_blocks(body, ctx)}</div>{h}{s}</div>')


def render_checklist(buf, ctx):
    ctx["check"] += 1
    out = ['<ul class="checklist">']
    k = 0
    for line in buf:
        m = LIST_RE.match(line.strip())
        if m:
            k += 1
            cid = f'{ctx["id"]}-c{ctx["check"]}-{k}'
            out.append(f'<li><label><input type="checkbox" data-save="{cid}"><span>{inline(m.group(2), ctx)}</span></label></li>')
    out.append("</ul>")
    return "".join(out)


def render_stepper(title, buf, ctx):
    code, steps, i = [], [], 0
    while i < len(buf) and not buf[i].strip().startswith("```"):
        i += 1
    i += 1
    while i < len(buf) and buf[i].strip() != "```":
        code.append(buf[i])
        i += 1
    for line in buf[i + 1:]:
        if not line.strip():
            continue
        p = [x.strip() for x in line.split("|", 3)]
        if len(p) < 4:
            warn(f"{ctx['id']}: bad stepper line: {line}")
            continue
        lines = []
        for part in p[0].split(","):
            if "-" in part:
                a, b = part.split("-")
                lines += list(range(int(a), int(b) + 1))
            elif part.strip() and part.strip() != "0":
                lines.append(int(part))
        stack, heap, frame = [], [], "main"
        if p[1] not in ("-", ""):
            for ent in p[1].split(";"):
                m = re.match(r"^\s*(?:\[(.+?)\]\s*)?(.+?)\s*=\s*(.*?)(?:\s*!(\w+))?\s*$", ent)
                if not m:
                    warn(f"{ctx['id']}: bad stack entry: {ent}")
                    continue
                if m.group(1):
                    frame = m.group(1)
                stack.append({"f": frame, "n": m.group(2), "v": m.group(3), "s": m.group(4) or ""})
        if p[2] not in ("-", ""):
            for ent in p[2].split(";"):
                m = re.match(r"^\s*#(\d+)\s*=\s*(.*?)(?:\s*!(\w+))?\s*$", ent)
                if not m:
                    warn(f"{ctx['id']}: bad heap entry: {ent}")
                    continue
                heap.append({"id": int(m.group(1)), "v": m.group(2), "s": m.group(3) or ""})
        steps.append({"lines": lines, "stack": stack, "heap": heap, "note": inline(p[3], ctx)})
    hl = highlight("\n".join(code), "rust").split("\n")
    code_html = "".join(f'<li data-n="{k + 1}"><code>{l or " "}</code></li>' for k, l in enumerate(hl))
    data = json.dumps({"steps": steps}, ensure_ascii=False).replace("</", "<\\/")
    return (f'<div class="stepper"><div class="st-head"><div class="st-title">{icon("layers")}<span>Step through it: '
            f'{inline(title, ctx)}</span></div>'
            f'<div class="st-ctl"><button type="button" class="btn small st-prev">{icon("arrow-left")}Back</button>'
            f'<span class="st-pos"></span><button type="button" class="btn small primary st-next">Next'
            f'{icon("arrow-right")}</button></div></div><ol class="st-code">{code_html}</ol>'
            f'<div class="st-mem"></div><p class="st-note" aria-live="polite"></p>'
            f'<script type="application/json">{data}</script></div>')


def render_glossary(buf, ctx):
    entries = []
    for line in buf:
        if "::" in line:
            t, _, d = line.partition("::")
            entries.append((t.strip(), d.strip()))
    entries.sort(key=lambda e: e[0].lower())
    out = ['<div class="gloss"><div class="gloss-search"><input type="search" id="gloss-filter" '
           'placeholder="Filter the glossary…" aria-label="Filter the glossary" autocomplete="off"></div><dl id="gloss-list">']
    for t, d in entries:
        out.append(f'<div class="gloss-item"><dt>{inline(t, ctx)}</dt><dd>{inline(d, ctx)}</dd></div>')
    out.append('</dl><p class="gloss-empty" hidden>No matching term. Try a shorter word.</p></div>')
    return "".join(out)


def render_directive(head, buf, ctx):
    kind, _, title = head.partition(" ")
    title = title.strip()
    if kind in CALLOUTS:
        ic, label = CALLOUTS[kind]
        t = f'<div class="callout-title">{inline(title, ctx)}</div>' if title else ""
        return (f'<aside class="callout c-{kind}"><div class="callout-label">{icon(ic)}{label}</div>{t}'
                f'<div class="callout-body">{parse_blocks(buf, ctx)}</div></aside>')
    if kind == "details":
        return (f'<details class="more"><summary>{icon("chevron")}{inline(title, ctx)}</summary>'
                f'<div class="d-body">{parse_blocks(buf, ctx)}</div></details>')
    if kind == "quiz":
        return render_quiz(title, buf, ctx)
    if kind == "exercise":
        return render_exercise(title, buf, ctx)
    if kind == "checklist":
        return render_checklist(buf, ctx)
    if kind == "stepper":
        return render_stepper(title, buf, ctx)
    if kind == "glossary":
        return render_glossary(buf, ctx)
    if kind == "html":
        return "\n".join(buf)
    warn(f"{ctx['id']}: unknown directive :::{kind}")
    return parse_blocks(buf, ctx)


# ───────────────────────── chapters ─────────────────────────

def load_chapter(path):
    lines = path.read_text(encoding="utf-8").split("\n")
    meta, i = {}, 0
    while i < len(lines) and lines[i].startswith("@"):
        k, _, v = lines[i][1:].partition(" ")
        meta[k] = v.strip()
        i += 1
    meta.setdefault("kind", "chapter")
    meta.setdefault("level", "beginner")
    meta["_lines"] = lines[i:]
    meta["_file"] = path.name
    return meta


def load_glossary(chapters):
    for ch in chapters:
        if ch["id"] != "glossary":
            continue
        inside = False
        for line in ch["_lines"]:
            if line.strip().startswith(":::glossary"):
                inside = True
            elif line.strip() == ":::":
                inside = False
            elif inside and "::" in line:
                t, _, d = line.partition("::")
                GLOSSARY[t.strip().lower()] = (t.strip(), d.strip())


def render_chapter(ch, prev, nxt, part_title):
    ctx = {"id": ch["id"], "slugs": set(), "quiz": 0, "ex": 0, "check": 0}
    body = parse_blocks(ch["_lines"], ctx)
    kicker = part_title
    lvl = ch["level"]
    meta_bits = []
    if lvl in LEVELS and ch["kind"] != "appendix":
        meta_bits.append(f'<span class="lvl lvl-{lvl}">{LEVELS[lvl]}</span>')
    if ch.get("time"):
        meta_bits.append(f'<span class="ch-time">about {ch["time"]} min</span>')
    if ch["kind"] == "project":
        meta_bits.insert(0, f'<span class="lvl lvl-project">{icon("flag")}Project</span>')
    learn = ""
    if ch.get("learn"):
        items = "".join(f"<li>{icon('check')}<span>{inline(x.strip(), ctx)}</span></li>" for x in ch["learn"].split("|"))
        learn = f'<div class="ch-learn"><div class="ch-learn-h">By the end of this chapter you will be able to</div><ul>{items}</ul></div>'
    pn = '<nav class="ch-nav" aria-label="Chapter navigation">'
    if prev:
        pn += (f'<a class="ch-nav-a prev" href="#{prev["id"]}" data-nav="{prev["id"]}">{icon("arrow-left")}'
               f'<span><small>Previous</small><b>{inline(prev["title"])}</b></span></a>')
    else:
        pn += "<span></span>"
    if nxt:
        pn += (f'<a class="ch-nav-a next" href="#{nxt["id"]}" data-nav="{nxt["id"]}"><span><small>Next</small>'
               f'<b>{inline(nxt["title"])}</b></span>{icon("arrow-right")}</a>')
    pn += "</nav>"
    done = ""
    if ch["kind"] != "appendix":
        done = (f'<div class="ch-done"><div><b>Finished this chapter?</b><span>Mark it complete to track your '
                f'progress through the guide.</span></div><button type="button" class="btn primary btn-done" '
                f'data-done="{ch["id"]}">{icon("check")}<span>Mark as complete</span></button></div>')
    return (f'<section class="chapter kind-{ch["kind"]}" id="ch-{ch["id"]}" data-id="{ch["id"]}" hidden>'
            f'<header class="ch-head"><div class="ch-kicker"><span>{esc(kicker)}</span>{"".join(meta_bits)}</div>'
            f'<div class="ch-num" aria-hidden="true">{ch["num"]}</div>'
            f'<h1 tabindex="-1">{inline(ch["title"], ctx)}</h1>{learn}</header>'
            f'<div class="ch-body">{body}</div>{done}{pn}</section>')


def build():
    files = sorted(CHAPTERS.glob("*.md"))
    chapters = [load_chapter(f) for f in files]
    for ch in chapters:
        if "id" not in ch or "title" not in ch or "part" not in ch:
            sys.exit(f"{ch['_file']}: needs @id, @title and @part")
    part_order = {p[0]: i for i, p in enumerate(PARTS)}
    chapters.sort(key=lambda c: (part_order[c["part"]], c["_file"]))
    num, letter = 0, 0
    for ch in chapters:
        KNOWN_IDS.add(ch["id"])
        if ch["kind"] == "appendix":
            ch["num"] = "ABCDEFGHIJ"[letter]
            letter += 1
        elif ch["part"] == "welcome":
            ch["num"] = "0"
        else:
            num += 1
            ch["num"] = f"{num:02d}"
        NUMS[ch["id"]] = ch["num"]
        if ch["kind"] == "project":
            stats["projects"] += 1
    load_glossary(chapters)

    part_titles = {}
    pn = 0
    for key, title, level, blurb in PARTS:
        if key.startswith("p"):
            pn += 1
            part_titles[key] = f"Part {pn} · {title}"
        else:
            part_titles[key] = title

    sections = []
    for i, ch in enumerate(chapters):
        prev = chapters[i - 1] if i else None
        nxt = chapters[i + 1] if i + 1 < len(chapters) else None
        sections.append(render_chapter(ch, prev, nxt, part_titles[ch["part"]]))

    for src, target in LINKS:
        if target not in KNOWN_IDS and target != "home":
            warn(f"{src}: link to unknown chapter #{target}")

    # sidebar table of contents + home learning path
    toc, path = [], []
    pn = 0
    for key, title, level, blurb in PARTS:
        chs = [c for c in chapters if c["part"] == key]
        if not chs:
            continue
        label = ""
        if key.startswith("p"):
            pn += 1
            label = f"Part {pn}"
        items = ""
        chips = ""
        for c in chs:
            proj = icon("flag", "proj") if c["kind"] == "project" else ""
            items += (f'<li><a href="#{c["id"]}" data-nav="{c["id"]}"><span class="tn">{c["num"]}</span>'
                      f'<span class="tt">{inline(c.get("short") or c["title"])}</span>{proj}'
                      f'<span class="tick">{icon("check")}</span></a></li>')
            chips += (f'<a class="chip{" chip-project" if c["kind"] == "project" else ""}" href="#{c["id"]}" '
                      f'data-nav="{c["id"]}"><span class="tn">{c["num"]}</span>{inline(c.get("short") or c["title"])}'
                      f'<span class="tick">{icon("check")}</span></a>')
        lab = f'<span class="toc-part-label">{label}</span>' if label else ""
        toc.append(f'<div class="toc-part" data-part="{key}"><button type="button" class="toc-part-btn" '
                   f'aria-expanded="true">{icon("chevron")}<span class="toc-part-title">{lab}{esc(title)}</span>'
                   f'<span class="toc-count"></span></button><ol class="toc-list">{items}</ol></div>')
        if key != "welcome":
            lv = f'<span class="lvl lvl-{level.lower()}">{level}</span>' if level else ""
            path.append(f'<li class="path-part" data-part="{key}"><div class="path-num">{pn if label else "＋"}</div>'
                        f'<div class="path-body"><h3>{esc(title)}{lv}</h3><p>{esc(blurb)}</p>'
                        f'<div class="chips">{chips}</div></div></li>')

    data = {
        "chapters": [{"id": c["id"], "num": c["num"], "title": c["title"], "part": c["part"],
                      "partTitle": part_titles[c["part"]], "kind": c["kind"]} for c in chapters],
        "glossary": {k: {"t": t, "d": inline(d)} for k, (t, d) in GLOSSARY.items()},
    }
    tracked = [c for c in chapters if c["kind"] != "appendix"]
    home = (ASSETS / "home.html").read_text(encoding="utf-8")
    for k, v in {"%%N_CH%%": str(len(tracked)), "%%N_EX%%": str(stats["exercises"]),
                 "%%N_Q%%": str(stats["questions"]), "%%N_PROJ%%": str(stats["projects"]),
                 "%%N_CODE%%": str(stats["code"]), "%%PATH%%": "".join(path)}.items():
        home = home.replace(k, v)

    page = (ASSETS / "template.html").read_text(encoding="utf-8")
    for k, v in {
        "%%CSS%%": (ASSETS / "style.css").read_text(encoding="utf-8"),
        "%%JS%%": (ASSETS / "app.js").read_text(encoding="utf-8"),
        "%%SPRITE%%": (ASSETS / "icons.svg").read_text(encoding="utf-8"),
        "%%TOC%%": "".join(toc),
        "%%HOME%%": home,
        "%%CHAPTERS%%": "\n".join(sections),
        "%%DATA%%": json.dumps(data, ensure_ascii=False).replace("</", "<\\/"),
    }.items():
        page = page.replace(k, v)
    OUT.write_text(page, encoding="utf-8")
    print(f"built {OUT.name}: {len(chapters)} chapters, {stats['code']} code examples, "
          f"{stats['exercises']} exercises, {stats['questions']} quiz questions, "
          f"{stats['projects']} projects, {OUT.stat().st_size / 1024:.0f} KB")
    if warnings:
        print(f"{len(warnings)} warning(s):")
        for w in warnings[:60]:
            print("  -", w)


if __name__ == "__main__":
    build()
