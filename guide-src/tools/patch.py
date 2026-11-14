#!/usr/bin/env python3
"""Small helper for exact, checked edits of chapter files.

    from patch import insert_before, insert_after, replace
Each function fails loudly unless the anchor text occurs exactly once.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "chapters"


def _load(name):
    path = ROOT / name
    return path, path.read_text(encoding="utf-8")


def replace(name, old, new):
    path, s = _load(name)
    assert s.count(old) == 1, f"{name}: anchor found {s.count(old)} times: {old[:60]!r}"
    path.write_text(s.replace(old, new), encoding="utf-8")


def insert_before(name, anchor, text):
    replace(name, anchor, text.rstrip("\n") + "\n\n" + anchor)


def insert_after(name, anchor, text):
    replace(name, anchor, anchor + "\n\n" + text.strip("\n"))
