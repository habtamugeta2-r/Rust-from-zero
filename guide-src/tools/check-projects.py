#!/usr/bin/env python3
"""Rebuild and test the extracted multi-file and cross-target projects shown in the guide."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    cmd = [sys.executable, str(ROOT / "tools" / "check.py"), "--projects"]
    cmd.extend(sys.argv[1:])
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
