#!/usr/bin/env python3
"""Fills drafts/51.md from the tested scratch files and the saved program outputs -> chapters/51-performance.md"""
import re
from pathlib import Path

SCRATCH = Path("/opt/rs/scratch")
OUT = Path("/opt/rs/tmp/out51")
HERE = Path(__file__).resolve().parent
text = (HERE / "51.md").read_text(encoding="utf-8")

special = {
    "hyperfine": Path("/opt/rs/tmp/hyperfine_default.txt").read_text().strip("\n"),
    "p1head": "\n".join((OUT / "p1.txt").read_text().split("\n")[:2]),
}

def file_marker(m):
    return (SCRATCH / m.group(1)).read_text(encoding="utf-8").rstrip("\n")

def hidden_marker(m):
    lines = (SCRATCH / m.group(1)).read_text(encoding="utf-8").rstrip("\n").split("\n")
    return "\n".join(("# " + l) if l.strip() else "#" for l in lines)

def value_marker(m):
    name = m.group(1)
    if name in special:
        return special[name]
    return (OUT / name).read_text(encoding="utf-8").rstrip("\n")

text = re.sub(r"@@F:([^@]+)@@", file_marker, text)
text = re.sub(r"@@H:([^@]+)@@", hidden_marker, text)
text = re.sub(r"@@V:([^@]+)@@", value_marker, text)
assert "@@" not in text, re.findall(r"@@[^@]*@@", text)[:5]
(HERE.parent / "chapters" / "51-performance.md").write_text(text, encoding="utf-8")
print("written", len(text.split("\n")), "lines")
