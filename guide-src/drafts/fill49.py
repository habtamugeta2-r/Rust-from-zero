#!/usr/bin/env python3
"""Fills drafts/49.md (markers @@F:path@@ and @@V:name@@) from the tested scratch projects."""
import re
import sys
from pathlib import Path

SCRATCH = Path('/opt/rs/scratch')
SRC = Path('/home/user/guide-src/drafts/49.md')
OUT = Path('/home/user/guide-src/chapters/49-apps.md')


def read(rel):
    return (SCRATCH / rel).read_text().rstrip('\n')


def between(text, start, end_line):
    lines = text.split('\n')
    first = next(i for i, line in enumerate(lines) if line.startswith(start))
    last = next(i for i in range(first, len(lines)) if lines[i] == end_line)
    return '\n'.join(lines[first:last + 1])


dts_lines = read('wasm_hello/pkg/wasm_hello.d.ts').split('\n')
dts_first = next(i for i, line in enumerate(dts_lines) if line.startswith('/**'))
dts_last = next(i for i, line in enumerate(dts_lines) if line.startswith('export function greet'))
dts = '\n'.join(dts_lines[dts_first:dts_last + 1])

glue = between(read('wasm_hello/pkg/wasm_hello.js'), 'export function greet(name) {', '}')

VALUES = {
    'wasm_pack_out': """[INFO]: Checking for the Wasm target...
[INFO]: Compiling to Wasm...
   Compiling wasm_hello v0.1.0 (/home/sara/wasm_hello)
    Finished `release` profile [optimized] target(s) in 8.79s
[INFO]: Optimizing wasm binaries with `wasm-opt`...
[INFO]: Optional fields missing from Cargo.toml: 'description', 'repository', and 'license'. These are not necessary, but recommended
[INFO]: :-) Done in 16.78s
[INFO]: :-) Your wasm pkg is ready to publish at /home/sara/wasm_hello/pkg.""",
    'dts': dts,
    'glue': glue,
    't_native': '0.51',
    't_wasm': '0.52',
    't_js': '0.51',
    'speed_text': (
        "The three times are the same. (The last digit moves by one from run to run.) "
        "This loop spends nearly all of its time dividing, and a division takes the processor "
        "equally long, whoever asks for it. So the Wasm version reaches the full speed of a native "
        "program here. But so does JavaScript."
    ),
    'trunk_text': (
        "The first build takes a minute or two. Then Trunk serves the page at "
        "`http://127.0.0.1:8080`, opens it in the browser, and builds again whenever a file "
        "changes. `trunk build --release` writes the finished files into a folder `dist`, "
        "ready to be put on any web server."
    ),
    'tauri_size_text': (
        "For the example, the package for Debian and Ubuntu came to 1.8 MB, with a program of "
        "5 MB inside. The package names the WebKitGTK library of the system as a requirement, "
        "which is exactly why it can be this small."
    ),
}

text = SRC.read_text()


def file_marker(match):
    return read(match.group(1))


def value_marker(match):
    return VALUES[match.group(1)]


text = re.sub(r'@@F:([^@]+)@@', file_marker, text)
text = re.sub(r'@@V:([^@]+)@@', value_marker, text)
left = re.findall(r'@@[^@\n]*@@', text)
if left:
    sys.exit(f'unfilled markers: {left}')
OUT.write_text(text)
print(f'wrote {OUT} ({len(text.splitlines())} lines)')
