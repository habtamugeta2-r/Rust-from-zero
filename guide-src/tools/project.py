#!/usr/bin/env python3
"""Rebuild multi-file projects from chapter listings, to prove every chapter project is complete.

A fence such as   ```rust proj=shortener file=src/store.rs   belongs to the project `shortener`.
Several fences with the same file are joined in order (mark the later ones with `cont`).
Optional `target=<t1>,<t2>` flags declare cross-compilation / check targets (for example `wasm32-unknown-unknown`).

    python3 tools/project.py 48 shortener /opt/rs/scratch/from_chapter
    cd /opt/rs/scratch/from_chapter && cargo test
    python3 tools/project.py --list
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHAPTERS = ROOT / "chapters"


def _scan(chapter_prefix=""):
    projects = {}
    pattern = f"{chapter_prefix}*.md" if chapter_prefix else "*.md"
    for path in sorted(CHAPTERS.glob(pattern)):
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
                proj = next((f[5:] for f in flags if f.startswith("proj=")), None)
                if proj:
                    name = next((f[5:] for f in flags if f.startswith("file=")), None)
                    if name is None:
                        sys.exit(f"{path.name}: a proj= block without file=")
                    entry = projects.setdefault(proj, {
                        "chapter": path.name,
                        "files": {},
                        "targets": [],
                    })
                    if entry["chapter"] != path.name:
                        sys.exit(f"proj={proj} spans multiple chapters ({entry['chapter']} and {path.name})")
                    for f in flags:
                        if f.startswith("target="):
                            for t in f[7:].split(","):
                                if t and t not in entry["targets"]:
                                    entry["targets"].append(t)
                    entry["files"].setdefault(name, []).append("\n".join(body).strip("\n"))
            i += 1
    return projects


def extract(chapter_prefix, project):
    projects = _scan(chapter_prefix)
    entry = projects.get(project)
    return entry["files"] if entry else {}


def list_projects(chapter_prefix=""):
    projects = _scan(chapter_prefix)
    out = []
    for name, entry in sorted(projects.items(), key=lambda kv: (kv[1]["chapter"], kv[0])):
        cfg = "\n\n".join(entry["files"].get(".cargo/config.toml", []))
        m = re.search(r'^\s*target\s*=\s*"([^"]+)"', cfg, flags=re.M)
        cfg_target = m.group(1) if m else None
        out.append({
            "name": name,
            "chapter": entry["chapter"],
            "files": entry["files"],
            "targets": list(entry["targets"]),
            "config_target": cfg_target,
        })
    return out


def write_project(files, name, out, ensure_manifest=False, clean=False):
    out = Path(out)
    if clean and out.exists():
        shutil.rmtree(out)
    to_write = {k: "\n\n".join(v) + "\n" for k, v in files.items()}
    if ensure_manifest:
        pkg_name = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
        header = f'[package]\nname = "{pkg_name}"\nversion = "0.1.0"\nedition = "2024"\n'
        if "Cargo.toml" not in to_write:
            to_write["Cargo.toml"] = header
        elif "[package]" not in to_write["Cargo.toml"]:
            to_write["Cargo.toml"] = header + "\n" + to_write["Cargo.toml"]
    for rel, content in to_write.items():
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return to_write


def main():
    if sys.argv[1:] == ["--list"]:
        for p in list_projects():
            t = ",".join(p["targets"]) or p["config_target"] or "host"
            print(f"{p['chapter']:<28} {p['name']:<18} targets={t:<30} files={len(p['files'])}")
        return
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    chapter, project, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    files = extract(chapter, project)
    if not files:
        sys.exit("no blocks found")
    write_project(files, project, out)
    for name, parts in files.items():
        print(f"{name}: {len(parts)} block(s), {sum(p.count(chr(10)) + 1 for p in parts)} lines")


if __name__ == "__main__":
    main()
