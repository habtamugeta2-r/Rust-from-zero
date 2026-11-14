#!/usr/bin/env python3
"""Structural audit of the chapters.

  python3 tools/audit.py            one line per chapter + a list of structural problems
  python3 tools/audit.py outline    every heading of every chapter (the full table of contents)
  python3 tools/audit.py terms      every term defined in bold, with the chapter that defines it
  python3 tools/audit.py find WORD… for each word or regex: the chapters that mention it (and how often)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CH = sorted((ROOT / "chapters").glob("*.md"))


def load(path):
    text = path.read_text(encoding="utf-8")
    meta = dict(re.findall(r"^@(\w+)\s+(.*)$", text, flags=re.M))
    return meta, text


def prose_only(text):
    """The text without code fences (for word counts and term searches in prose)."""
    return re.sub(r"^```.*?^```", "", text, flags=re.M | re.S)


def box_problems(text, name):
    """Report stray or unclosed :::-box fences (a box that is never closed, or a :::
    with nothing to close, silently swallows the rest of the chapter)."""
    out, stack, in_fence = [], [], False
    for i, line in enumerate(text.split("\n"), 1):
        s = line.strip()
        if s.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if s == ":::":
            if stack:
                stack.pop()
            else:
                out.append(f"{name}: stray ':::' at line {i} with no box open")
        elif s.startswith(":::") and len(s) > 4 and s[3].isalpha():
            stack.append((s.split()[0], i))
    for opener, i in stack:
        out.append(f"{name}: unclosed {opener} (opened at line {i})")
    return out


def summary(strict=False):
    problems = []
    total = {"lines": 0, "words": 0, "rust": 0, "ex": 0, "quiz": 0}
    print(f"{'file':<28}{'kind':<12}{'lines':>6}{'words':>7}{'rust':>5}{'chk':>5}{'ex':>4}{'quiz':>5}  boxes")
    for p in CH:
        meta, text = load(p)
        kind = meta.get("kind", "chapter")
        lines = text.count("\n")
        words = len(re.findall(r"\w+", prose_only(text)))
        fences = re.findall(r"^```(\w+)([^\n]*)$", text, flags=re.M)
        rust = [f for f in fences if f[0] == "rust"]
        checked = [f for f in rust if re.search(r"\b(run|wrap|check|test|fail|panic|warns)\b", f[1]) or "proj=" in f[1]]
        ex = len(re.findall(r"^:::exercise", text, flags=re.M))
        quiz = len(re.findall(r"^\? ", text, flags=re.M))
        boxes = "".join(ch if re.search(rf"^:::{name}\b", text, flags=re.M) else "-"
                        for ch, name in (("A", "analogy"), ("C", "compare"), ("R", "recap"), ("Q", "quiz"),
                                         ("S", "stepper"), ("L", "checklist")))
        print(f"{p.name:<28}{kind:<12}{lines:>6}{words:>7}{len(rust):>5}{len(checked):>5}{ex:>4}{quiz:>5}  {boxes}")
        for k, v in (("lines", lines), ("words", words), ("rust", len(rust)), ("ex", ex), ("quiz", quiz)):
            total[k] += v
        if kind == "appendix":
            continue
        for field in ("id", "part", "title", "short", "level", "time", "learn"):
            if field not in meta:
                problems.append(f"{p.name}: header @{field} is missing")
        if "R" not in boxes:
            problems.append(f"{p.name}: no :::recap")
        if kind == "chapter" and p.name[:2] != "00":
            if "Q" not in boxes:
                problems.append(f"{p.name}: no quiz")
            elif quiz < 4:
                problems.append(f"{p.name}: only {quiz} quiz questions")
            if ex < 3:
                problems.append(f"{p.name}: only {ex} exercises")
            if "A" not in boxes:
                problems.append(f"{p.name}: no :::analogy")
            if "C" not in boxes:
                problems.append(f"{p.name}: no :::compare box")
        if kind == "project" and "L" not in boxes:
            problems.append(f"{p.name}: project without :::checklist")
        hints = len(re.findall(r"^::hint", text, flags=re.M))
        sols = len(re.findall(r"^::solution", text, flags=re.M))
        if hints != ex or sols != ex:
            problems.append(f"{p.name}: {ex} exercises, {hints} hints, {sols} solutions")
        for word in ("TODO", "FIXME", "XXX", "TBD", "lorem", "@@"):
            if word in text:
                problems.append(f"{p.name}: contains {word!r}")
        problems.extend(box_problems(text, p.name))
    print(f"{'total':<40}{total['lines']:>6}{total['words']:>7}{total['rust']:>5}{'':>5}{total['ex']:>4}{total['quiz']:>5}")
    print(f"\n{len(problems)} structural remark(s):")
    for pr in problems:
        print("  -", pr)
    if strict and problems:
        sys.exit(1)


def outline():
    for p in CH:
        meta, text = load(p)
        print(f"\n== {p.name[:2]} {meta.get('title', '?')}  [{meta.get('level', '')}, {meta.get('time', '')} min]")
        body = prose_only(text)
        for m in re.finditer(r"^(##+) (.*)$|^:::(exercise \w+|details|stepper) (.*)$", body, flags=re.M):
            if m.group(1):
                print(("  " if m.group(1) == "##" else "      ") + m.group(2))
            else:
                print(f"      [{m.group(3).split()[0]}] {m.group(4)}")


def terms():
    seen = {}
    for p in CH:
        _, text = load(p)
        for m in re.finditer(r"\*\*([^*\n]{2,60})\*\*", prose_only(text)):
            term = m.group(1).strip().strip(".,:;").lower()
            if term and term not in seen and len(term.split()) <= 4 and not term.endswith(("?", "!")):
                seen[term] = p.name[:2]
    for term in sorted(seen):
        print(f"{seen[term]}  {term}")
    print(f"\n{len(seen)} bold terms", file=sys.stderr)


def find(words):
    texts = [(p.name[:2], p.read_text(encoding="utf-8")) for p in CH]
    for w in words:
        rx = re.compile(w)
        hits = [(n, len(rx.findall(t))) for n, t in texts]
        hits = [(n, c) for n, c in hits if c]
        total = sum(c for _, c in hits)
        where = " ".join(f"{n}×{c}" if c > 1 else n for n, c in hits[:14]) + (" …" if len(hits) > 14 else "")
        print(f"{'MISSING' if not hits else str(total):>7}  {w:<34} {where}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = set(sys.argv[1:]) - set(args)
    mode = args[0] if args else ""
    if mode == "outline":
        outline()
    elif mode == "terms":
        terms()
    elif mode == "find":
        find(args[1:])
    else:
        summary(strict="--strict" in opts)
