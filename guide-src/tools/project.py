#!/usr/bin/env python3
"""Rebuild a multi-file project from the listings of a chapter, to prove that the chapter is complete.

A fence such as   ```rust proj=shortener file=src/store.rs   belongs to the project `shortener`.
Several fences with the same file are joined in order (mark the later ones with `cont`).

    python3 tools/project.py 48 shortener /opt/rs/scratch/from_chapter
    cd /opt/rs/scratch/from_chapter && cargo test
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def extract(chapter_prefix, project):
    files = {}
    for path in sorted((ROOT / "chapters").glob(f"{chapter_prefix}*.md")):
        lines = path.read_text(encoding="utf-8").split("\n")
        i = 0
        while i < len(lines):
            line = lines[i]
            if line.startswith("```") and line.strip() != "```":
                flags = line[3:].split()
                body = []
                i += 1
                while i < len(lines) and lines[i].strip() != "```":
                    body.append(lines[i])
                    i += 1
                if f"proj={project}" in flags:
                    name = next((f[5:] for f in flags if f.startswith("file=")), None)
                    if name is None:
                        sys.exit(f"{path.name}: a proj= block without file=")
                    files.setdefault(name, []).append("\n".join(body).strip("\n"))
            i += 1
    return files


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    chapter, project, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    files = extract(chapter, project)
    if not files:
        sys.exit("no blocks found")
    for name, parts in files.items():
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n\n".join(parts) + "\n", encoding="utf-8")
        print(f"{name}: {len(parts)} block(s), {sum(p.count(chr(10)) + 1 for p in parts)} lines")


if __name__ == "__main__":
    main()
