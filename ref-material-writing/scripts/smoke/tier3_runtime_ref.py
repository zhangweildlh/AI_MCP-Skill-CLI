#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier-3 runtime gate for ref-material-writing.

Scope declaration (read before editing):

* Coverage: this script verifies the runtime executability of the AnySearch
  CLI bundled with ref-material-writing (``scripts/anysearch_cli.py``) --
  the process must start, ``--help`` must exit 0, and every documented
  subcommand keyword must appear in stdout.
* Non-coverage: this script does NOT cover the separate web-search skill or
  any of its CLIs. It never reads, imports, or copies files outside the
  ref-material-writing tree.
* Implementation: Python standard library only (no third-party imports such
  as ``requests``). ``uv`` appears solely as the external command used to
  launch the CLI under test -- it is never imported.
* Relationship to ``tier3_runtime.py``: parallel and fully independent. The
  two scripts do not import, exec, or otherwise reference each other; edits
  to one must not assume anything about the other.

Exit codes: 0 = PASS, 1 = FAIL.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CLI_PATH = REPO_ROOT / "scripts" / "anysearch_cli.py"
CONSTANTS_PATH = REPO_ROOT / "scripts" / "shared" / "constants.json"

# UV 工程路径：本机专属，默认回退到用户工具链目录；跨机/跨用户可经
# 环境变量 REF_MATERIAL_UV_PROJECT 覆盖，无需改脚本。
UV_PROJECT = os.environ.get("REF_MATERIAL_UV_PROJECT", "D:/Tools/Assembly/python/myenv")

# Subcommands that must be advertised by ``--help``.
REQUIRED_SUBCOMMANDS = (
    "search",
    "get_sub_domains",
    "extract",
    "batch_search",
    "doc",
)

CLI_TIMEOUT_SECONDS = 180


def check_cli_help() -> list[str]:
    """Run the CLI with ``--help`` and assert exit code plus subcommands."""
    failures: list[str] = []

    # F4 修复：uv 工程目录为本机专属默认值；若非由环境变量显式设置且目录不存在，
    # 给出清晰提示并跳过 CLI 启动检查（降级而非神秘失败）。
    _env_uv = os.environ.get("REF_MATERIAL_UV_PROJECT")
    if _env_uv is None and not os.path.isdir(UV_PROJECT):
        print(
            f"[WARN] uv 工程目录不存在：{UV_PROJECT}；"
            "跳过 CLI 启动检查（设置 REF_MATERIAL_UV_PROJECT 指向你的 uv 工程后可启用）。"
        )
        return failures

    cmd = [
        "uv",
        "run",
        "--project",
        UV_PROJECT,
        "python",
        str(CLI_PATH),
        "--help",
    ]
    print("[RUN] " + " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            shell=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=CLI_TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        failures.append("CLI launch failed: 'uv' executable not found on PATH")
        return failures
    except subprocess.TimeoutExpired:
        failures.append(
            "CLI launch failed: timed out after "
            f"{CLI_TIMEOUT_SECONDS}s"
        )
        return failures

    if proc.returncode != 0:
        failures.append(
            f"exit code {proc.returncode} != 0; stderr: "
            f"{proc.stderr.strip()[:500]}"
        )

    stdout = proc.stdout or ""
    for name in REQUIRED_SUBCOMMANDS:
        if name in stdout:
            print(f"  [OK] subcommand advertised: {name}")
        else:
            failures.append(f"subcommand keyword missing from --help stdout: {name}")

    return failures


def check_constants_json() -> list[str]:
    """Assert ``scripts/shared/constants.json`` parses as valid JSON."""
    failures: list[str] = []
    print(f"[RUN] json.load {CONSTANTS_PATH}")

    if not CONSTANTS_PATH.is_file():
        failures.append(f"constants.json not found at {CONSTANTS_PATH}")
        return failures

    try:
        with CONSTANTS_PATH.open("r", encoding="utf-8") as handle:
            json.load(handle)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
        failures.append(f"constants.json is not valid JSON: {exc}")
        return failures

    print("  [OK] constants.json parses as valid JSON")
    return failures


def main() -> int:
    print("=== tier3_runtime_ref: ref-material-writing CLI runtime gate ===")

    failures: list[str] = []
    failures.extend(check_cli_help())
    failures.extend(check_constants_json())

    print("-" * 60)
    if failures:
        print(f"FAIL: {len(failures)} check(s) failed")
        for item in failures:
            print(f"  - {item}")
        return 1

    print("PASS: ref-material-writing AnySearch CLI runtime gate passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
