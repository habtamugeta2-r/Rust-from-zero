#!/usr/bin/env python3
"""Compile-tests the Rust examples in chapters/*.md with the real compiler.

Flags after ```rust decide what is checked:
  run     complete program: must compile and run; stdout must equal a directly following ```output block
  wrap    loose statements: wrapped in fn main() { ... } and then treated like `run`
  check   must compile (it is not run)
  test    compiled with --test; all tests must pass
  fail    must NOT compile; add an error code (E0382) to require that code in the message
  panic   must compile and then panic when run
  warns   must compile with at least one warning (the warning can be captured into an `error auto` block)
  ext     needs crates from crates.io: checked with cargo (ext=<project>, default "main")
  nocmp   do not compare the output
Lines starting with "# " are compiled but hidden from readers (like rustdoc).

Usage: check.py [name-part ...] [--ext] [--nocache] [--warn] [--show FILE:LINE]
"""
import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CH = ROOT / "chapters"
BASE = Path(os.environ.get("RUST_CHECK_HOME", "/opt/rs"))
WORK = BASE / "chk"
EXT = BASE / "ext"
CAPTURED = ROOT / "captured"   # real compiler messages / program output, inserted by build.py into `auto` blocks
ENV = dict(os.environ)
if (BASE / "cargo").exists():
    ENV.update(RUSTUP_HOME=str(BASE / "rustup"), CARGO_HOME=str(BASE / "cargo"),
               PATH=str(BASE / "cargo/bin") + ":" + os.environ["PATH"],
               CARGO_TARGET_DIR=str(BASE / "target"), TMPDIR=str(BASE / "tmp"))
KINDS = ("run", "wrap", "check", "test", "fail", "panic", "warns")


def extract(path):
    lines = path.read_text(encoding="utf-8").split("\n")
    blocks, i = [], 0
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith("```") and s != "```":
            info = s[3:].split()
            j, buf = i + 1, []
            while j < len(lines) and lines[j].strip() != "```":
                buf.append(lines[j])
                j += 1
            blocks.append({"lang": info[0], "flags": info[1:], "code": buf, "line": i + 1, "gap": False,
                           "file": path.name})
            i = j + 1
        else:
            if s and blocks:
                blocks[-1]["gap"] = True
            i += 1
    for k, b in enumerate(blocks):
        nxt = blocks[k + 1] if k + 1 < len(blocks) else None
        b["expect"] = None
        b["auto"] = None
        b["hash"] = hashlib.sha1("\n".join(b["code"]).encode()).hexdigest()[:16]
        if nxt and nxt["lang"] in ("output", "error") and not b["gap"]:
            if "auto" in nxt["flags"]:
                b["auto"] = nxt["lang"]
            elif nxt["lang"] == "output" and "nocmp" not in b["flags"]:
                b["expect"] = "\n".join(nxt["code"])
    return blocks


def clean_compiler(stderr, src, want="error"):
    """Keep only the error (or warning) diagnostics, with the path a reader would see."""
    text = stderr.replace(str(src), "src/main.rs")
    chunks, cur = [], []
    for line in text.split("\n"):
        if re.match(r"^(error|warning)", line) and cur:
            chunks.append(cur)
            cur = []
        cur.append(line)
    if cur:
        chunks.append(cur)
    keep = []
    for ch in chunks:
        head = ch[0]
        if head.startswith("error: aborting") or re.match(r"^warning: `?\w+`? \(bin|^warning: \d+ warnings? emitted", head):
            continue
        if head.startswith(want):
            body = "\n".join(ch).rstrip()
            body = re.sub(r"\n+For more information about (this error|an error).*$", "", body, flags=re.S)
            body = re.sub(r"\n+Some errors have detailed explanations.*$", "", body, flags=re.S)
            keep.append(body.rstrip())
    return "\n\n".join(keep[:2]) + "\n"


def clean_panic(stdout, stderr, src):
    text = stderr.replace(str(src), "src/main.rs")
    text = re.sub(r"thread '(\w+)' \(\d+\) panicked", r"thread '\1' panicked", text)
    return (stdout + text).strip("\n") + "\n"


def capture(b, text):
    CAPTURED.mkdir(exist_ok=True)
    (CAPTURED / (b["hash"] + ".txt")).write_text(text, encoding="utf-8")


def source(b):
    out = []
    for l in b["code"]:
        st = l.lstrip()
        if st == "#":
            out.append("")
        elif st.startswith("# "):
            out.append(l.replace("# ", "", 1))
        elif st.startswith("## "):
            out.append(l.replace("## ", "# ", 1))
        else:
            out.append(l)
    code = "\n".join(out)
    flags = b["flags"]
    if "wrap" in flags or ("panic" in flags and "fn main" not in code) or ("fail" in flags and "fn main" not in code
                                                                           and "nowrap" not in flags):
        code = "fn main() {\n" + code + "\n}\n"
    plain_fail = ("fail" in flags or "warns" in flags or "panic" in flags) and ("fn main" in "\n".join(out) or "nowrap" in flags)
    if "run" not in flags and "ext" not in flags and not plain_fail and "nolint" not in flags:
        code = "#![allow(unused, dead_code)]\n" + code
    return code


def norm(s):
    return "\n".join(l.rstrip() for l in s.strip("\n").split("\n")).strip()


def edition(flags):
    for f in flags:
        if f.startswith("edition="):
            return f[8:]
    return "2024"


def check_block(b):
    flags = b["flags"]
    kind = next((f for f in flags if f in KINDS), None)
    code = source(b)
    name = f'{b["file"][:-3]}_{b["line"]}'.replace("-", "_")
    d = WORK / name
    d.mkdir(parents=True, exist_ok=True)
    src, exe = d / "main.rs", d / "main"
    src.write_text(code, encoding="utf-8")
    cmd = ["rustc", "--edition", edition(flags), "-C", "debuginfo=0", "--color", "never", "--crate-name", "example",
           "-o", str(exe), str(src)]
    if "release" in flags:
        cmd += ["-C", "opt-level=3"]
    if kind == "check":
        cmd += ["--emit=metadata"]
        if "fn main" not in code:
            cmd += ["--crate-type", "lib"]
    if kind == "test":
        cmd += ["--test"]
    if kind in ("fail", "warns") and "fn main" not in code:
        cmd += ["--crate-type", "lib"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, env=ENV, timeout=180)
    except subprocess.TimeoutExpired:
        return "FAIL", "compiler timed out"
    (d / "stderr.txt").write_text(r.stderr, encoding="utf-8")
    if kind == "fail":
        if r.returncode == 0:
            return "FAIL", "expected a compile error, but it compiled"
        codes = [f for f in flags if re.fullmatch(r"E\d{4}", f)]
        for c in codes:
            if c not in r.stderr:
                found = sorted(set(re.findall(r"E\d{4}", r.stderr)))
                return "FAIL", f"expected {c}, compiler gave {found}\n" + r.stderr[:600]
        if b["auto"] == "error":
            capture(b, clean_compiler(r.stderr, src))
        return "PASS", ""
    if r.returncode != 0:
        return "FAIL", r.stderr[:1800]
    if kind == "warns":
        if "warning" not in r.stderr:
            return "FAIL", "expected a compiler warning, but there was none"
        if b["auto"] == "error":
            capture(b, clean_compiler(r.stderr, src, "warning"))
        return "PASS", ""
    warn = ""
    if kind == "run" and "warning" in r.stderr:
        warn = r.stderr[:900]
    if kind == "check":
        return ("WARN", warn) if warn else ("PASS", "")
    try:
        p = subprocess.run([str(exe)], capture_output=True, text=True, timeout=20, stdin=subprocess.DEVNULL, cwd=str(d))
    except subprocess.TimeoutExpired:
        return "FAIL", "program timed out (20s)"
    (d / "stdout.txt").write_text(p.stdout, encoding="utf-8")
    (d / "run-stderr.txt").write_text(p.stderr, encoding="utf-8")
    try:
        exe.unlink()
    except OSError:
        pass
    if kind == "panic":
        if p.returncode == 0 or "panicked" not in p.stderr:
            return "FAIL", "expected a panic, but the program finished normally"
        if b["auto"] == "output":
            capture(b, clean_panic(p.stdout, p.stderr, src))
        return "PASS", ""
    if b["auto"] == "output" and p.returncode == 0:
        capture(b, p.stdout)
    if p.returncode != 0:
        return "FAIL", f"program exited with {p.returncode}\n{p.stderr[:900]}\n{p.stdout[-600:]}"
    if b["expect"] is not None and kind != "test":
        if norm(p.stdout) != norm(b["expect"]):
            return "FAIL", "output differs.\n--- actual:\n" + p.stdout[:1200] + "\n--- written in the guide:\n" + b["expect"][:1200]
    return ("WARN", warn) if warn else ("PASS", "")


def check_ext(blocks):
    """cargo check all `ext` examples, per project."""
    results = {}
    projects = {}
    for b in blocks:
        proj = next((f[4:] for f in b["flags"] if f.startswith("ext=")), "main")
        projects.setdefault(proj, []).append(b)
    for proj, bs in projects.items():
        pdir = EXT / proj
        if not (pdir / "Cargo.toml").exists():
            for b in bs:
                results[id(b)] = ("SKIP", f"no cargo project {pdir}")
            continue
        ex = pdir / "examples"
        ex.mkdir(exist_ok=True)
        wanted = {}
        for b in bs:
            name = f'{b["file"][:-3]}_{b["line"]}'.replace("-", "_")
            wanted[name] = b
            f = ex / f"{name}.rs"
            code = source(b)
            if "fn main" not in code:
                code += "\n#[allow(dead_code)]\nfn main() {}\n"
            if not f.exists() or f.read_text(encoding="utf-8") != code:
                f.write_text(code, encoding="utf-8")
        for f in ex.glob("*.rs"):
            if f.stem not in wanted:
                f.unlink()
        r = subprocess.run(["cargo", "check", "--examples", "--message-format", "short", "--color", "never"],
                           capture_output=True, text=True, env=ENV, cwd=str(pdir), timeout=1700)
        (pdir / "last-check.txt").write_text(r.stderr, encoding="utf-8")
        for name, b in wanted.items():
            errs = [l for l in r.stderr.split("\n") if f"examples/{name}.rs" in l and "error" in l]
            if errs:
                results[id(b)] = ("FAIL", "\n".join(errs[:8]))
            elif r.returncode != 0 and "could not compile" in r.stderr and f"example \"{name}\"" in r.stderr:
                results[id(b)] = ("FAIL", "could not compile (see last-check.txt)")
            elif r.returncode != 0 and not any("examples/" in l and "error" in l for l in r.stderr.split("\n")):
                results[id(b)] = ("FAIL", "cargo failed: " + r.stderr[-700:])
            else:
                results[id(b)] = ("PASS", "")
        for name, b in wanted.items():
            if results[id(b)][0] == "PASS" and "run" in b["flags"]:
                p = subprocess.run(["cargo", "run", "-q", "--example", name], capture_output=True, text=True, env=ENV,
                                   cwd=str(pdir), timeout=600, stdin=subprocess.DEVNULL)
                if p.returncode != 0:
                    results[id(b)] = ("FAIL", f"exit {p.returncode}\n{p.stderr[-900:]}")
                elif b["expect"] is not None and norm(p.stdout) != norm(b["expect"]):
                    results[id(b)] = ("FAIL", "output differs.\n--- actual:\n" + p.stdout[:1200]
                                      + "\n--- written in the guide:\n" + b["expect"][:1200])
    return results


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = [a for a in sys.argv[1:] if a.startswith("--")]
    if "--show" in opts:
        target = args[0]
        f, line = target.split(":")
        name = f'{f}_{line}'.replace("-", "_")
        for d in WORK.glob(f"*{name}*"):
            for n in ("stderr.txt", "stdout.txt", "run-stderr.txt"):
                if (d / n).exists():
                    print(f"=== {d.name}/{n}\n" + (d / n).read_text())
        return
    WORK.mkdir(parents=True, exist_ok=True)
    cache_file = WORK / "cache.json"
    cache = {}
    if cache_file.exists() and "--nocache" not in opts:
        cache = json.loads(cache_file.read_text())
    files = [f for f in sorted(CH.glob("*.md")) if not args or any(a in f.name for a in args)]
    todo, ext, total = [], [], 0
    for f in files:
        for b in extract(f):
            if b["lang"] != "rust":
                continue
            if "ext" in b["flags"] or any(x.startswith("ext=") for x in b["flags"]):
                ext.append(b)
                continue
            if not any(k in b["flags"] for k in KINDS):
                continue
            total += 1
            key = hashlib.sha1(("\n".join(b["code"]) + "|" + " ".join(b["flags"]) + "|" + str(b["expect"])
                                + "|" + str(b["auto"])).encode()).hexdigest()
            b["key"] = key
            if cache.get(key) == "PASS" and (not b["auto"] or (CAPTURED / (b["hash"] + ".txt")).exists()):
                continue
            todo.append(b)
    fails = warns = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for b, (status, msg) in zip(todo, pool.map(check_block, todo)):
            if status == "PASS" or (status == "WARN" and "--warn" not in opts):
                cache[b["key"]] = "PASS"
            if status == "FAIL":
                fails += 1
                print(f'✗ {b["file"]}:{b["line"]} [{" ".join(b["flags"])}]\n{msg.rstrip()}\n')
            elif status == "WARN":
                warns += 1
                if "--warn" in opts:
                    print(f'! {b["file"]}:{b["line"]} warnings\n{msg.rstrip()}\n')
    cache_file.write_text(json.dumps(cache))
    extmsg = f", {len(ext)} ext examples skipped (use --ext)" if ext else ""
    if ext and "--ext" in opts:
        res = check_ext(ext)
        ef = 0
        for b in ext:
            status, msg = res.get(id(b), ("SKIP", ""))
            if status != "PASS":
                ef += 1
                print(f'✗ {b["file"]}:{b["line"]} [{" ".join(b["flags"])}] {status}\n{msg.rstrip()}\n')
        fails += ef
        extmsg = f", {len(ext)} ext examples checked with cargo ({ef} failing)"
    print(f"{total} std examples: {total - len(todo)} cached, {len(todo) - fails if len(todo) >= fails else 0} newly passed, "
          f"{fails} failing, {warns} with warnings{extmsg}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
