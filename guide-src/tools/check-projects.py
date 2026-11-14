#!/usr/bin/env python3
"""Rebuild and test the multi-file projects shown in the guide."""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = (("48", "shortener"), ("52", "library"))


def main():
    if shutil.which("cargo") is None:
        sys.exit("cargo is required; install Rust with rustup before checking projects")

    with tempfile.TemporaryDirectory(prefix="rust-guide-projects-") as temp:
        temp_path = Path(temp)
        env = os.environ.copy()
        env.setdefault("CARGO_TARGET_DIR", str(temp_path / "target"))

        for chapter, name in PROJECTS:
            project_dir = temp_path / name
            print(f"\nChecking chapter {chapter}: {name}", flush=True)
            subprocess.run(
                [sys.executable, str(ROOT / "tools" / "project.py"), chapter, name, str(project_dir)],
                check=True,
            )
            subprocess.run(
                ["cargo", "test", "--all-targets"],
                cwd=project_dir,
                env=env,
                check=True,
            )


if __name__ == "__main__":
    main()
