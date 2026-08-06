#!/usr/bin/env python3
"""Check what needs deploying based on deploy-state.json."""

import json
import subprocess
from pathlib import Path

STATE_FILE = Path(__file__).parent.parent / "deploy-state.json"

MAPPING = {
    "frontend":  (("frontend/",), "make deploy-frontend"),
    "database":  (("supabase/migrations/",), "make deploy-db"),
    "backend":   (("backend/", "Makefile", "docker-compose.yml"), "make stage-kotlin-runtime"),
}

def main():
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    head = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"]).decode().strip()

    print(f"\n  HEAD: {head}\n")

    any_needed = False
    for name, (paths, cmd) in MAPPING.items():
        last = state.get(name, {}).get("commit", "")

        if not last:
            print(f"  \033[33m{name:<14}\033[0m never deployed → {cmd}")
            any_needed = True
            continue

        if last == head:
            continue

        try:
            changes = subprocess.check_output(
                ["git", "diff", "--name-only", last, "HEAD"]
            ).decode().splitlines()
            matched = [line for line in changes if any(line.startswith(path) for path in paths)]
            if matched:
                print(f"  \033[33m{name:<14}\033[0m {len(matched)} file(s) changed since {last} → {cmd}")
                any_needed = True
        except subprocess.CalledProcessError:
            print(f"  \033[33m{name:<14}\033[0m unknown (commit {last} not found) → {cmd}")
            any_needed = True

    if not any_needed:
        print("  \033[32mAll components up to date.\033[0m")

    print()


if __name__ == "__main__":
    main()
