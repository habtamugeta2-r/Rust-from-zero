#!/usr/bin/env python3
"""Print the captured compiler/panic/output text for every `auto` block of the given chapter prefixes."""
import hashlib, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
for pre in sys.argv[1:]:
    for f in sorted((root / 'chapters').glob(pre + '*.md')):
        lines = f.read_text().split('\n'); i = 0
        while i < len(lines):
            s = lines[i].strip()
            if s.startswith('```rust'):
                j = i + 1; buf = []
                while lines[j].strip() != '```':
                    buf.append(lines[j]); j += 1
                if j + 1 < len(lines) and 'auto' in lines[j + 1] and lines[j + 1].startswith('```'):
                    h = hashlib.sha1('\n'.join(buf).encode()).hexdigest()[:16]
                    cp = root / 'captured' / (h + '.txt')
                    print('=====', f.name, i + 1, lines[j + 1])
                    print(cp.read_text() if cp.exists() else '(no capture)')
                i = j
            i += 1
