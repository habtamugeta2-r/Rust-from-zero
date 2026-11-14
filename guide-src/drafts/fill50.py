#!/usr/bin/env python3
"""Fills drafts/50.md (markers @@F:path@@ and @@V:name@@) from the tested scratch projects."""
import re
import subprocess
import sys
from pathlib import Path

SCRATCH = Path('/opt/rs/scratch')
SRC = Path('/home/user/guide-src/drafts/50.md')
OUT = Path('/home/user/guide-src/chapters/50-games-embedded.md')


def read(rel):
    return (SCRATCH / rel).read_text().rstrip('\n')


def deps(rel):
    lines = read(rel).split('\n')
    start = lines.index('[dependencies]') + 1
    out = []
    for line in lines[start:]:
        if line.startswith('['):
            break
        if line.strip():
            out.append(line)
    return '\n'.join(out)


VALUES = {
    'qemu_deps': deps('qemu_hello/Cargo.toml'),
    'pico_deps': deps('pico_blink/Cargo.toml'),
    'polars_dep': deps('sales_polars/Cargo.toml'),
    'polars_out': Path('/opt/rs/tmp/polars_out.txt').read_text().rstrip('\n'),
    'gravity_out': Path('/opt/rs/tmp/gravity_out.txt').read_text().rstrip('\n'),
}

text = SRC.read_text()
text = re.sub(r'@@F:([^@]+)@@', lambda m: read(m.group(1)), text)
text = re.sub(r'@@V:([^@]+)@@', lambda m: VALUES[m.group(1)], text)
left = re.findall(r'@@[^@\n]*@@', text)
if left:
    sys.exit(f'unfilled markers: {left}')
OUT.write_text(text)
print(f'wrote {OUT} ({len(text.splitlines())} lines)')
