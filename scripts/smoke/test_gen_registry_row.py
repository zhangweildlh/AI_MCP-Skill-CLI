#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AGENTS.md §7.2 主表「实测」列生成器 scripts/gen-registry-row.cjs 的离线回归测试。

覆盖（AGENTS.md §9.6 测试资产纪律 / §7.5.1 生成纪律）：
  1. --list 解析主表映射为合法 JSON，且含预期已部署技能（含 wechat-article-to-ima）
  2. --skill <name> 人类可读输出含「聚合 md5」与文件数 / 字节 / 行 / CR 维度
  3. --skill <name> --json 输出 aggregate_md5 为 32 位 hex、files 为整数且 > 0
  4. 口径自洽：--skill chrome-devtools 的「26 文件」须与 §7.2 已登记值一致（维度数恒定）
测试全程只读复采 main 的 git blob，不调用 --rewrite，绝不写盘、不触碰真实部署态。
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO / "scripts" / "gen-registry-row.cjs"
NODE = "node"

CHECKS: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    CHECKS.append((name, bool(cond), detail))
    print(("  [PASS] " if cond else "  [FAIL] ") + name + ((" | " + detail) if detail else ""))


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [NODE, str(SCRIPT), *args], cwd=str(REPO),
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def main() -> int:
    print("=== gen-registry-row.cjs 离线回归 ===")
    if not SCRIPT.exists():
        check("生成器脚本存在", False, str(SCRIPT))
        return 1
    check("生成器脚本存在", True)

    # 1) --list 解析
    r = run("--list")
    rows = []
    if r.returncode == 0:
        try:
            rows = json.loads(r.stdout)
        except json.JSONDecodeError as e:
            check("--list 输出为合法 JSON", False, str(e))
    else:
        check("--list 可执行", False, r.stderr.strip()[:200])
    check("--list 可执行", r.returncode == 0)
    check("主表条目 >= 20", len(rows) >= 20, f"实际 {len(rows)}")
    names = {x.get("name") for x in rows}
    check("含 wechat-article-to-ima", "wechat-article-to-ima" in names)
    check("含 chrome-devtools", "chrome-devtools" in names)
    check("条目字段完整（name/devPath/deployPath/layout/deployed）",
          all(all(k in x for k in ("name", "devPath", "deployPath", "layout", "deployed"))
              for x in rows))

    # 2) --skill 人类可读输出
    r = run("--skill", "chrome-devtools")
    check("--skill chrome-devtools 可执行", r.returncode == 0, r.stderr.strip()[:160])
    out = r.stdout
    check("输出含「聚合 md5」", "聚合 md5" in out)
    check("输出含「26 文件」维度", "26 文件" in out, "维度恒定应与 §7.2 登记一致")
    check("输出含「行」与「CR」维度", ("行" in out and "CR" in out))

    # 3) --skill --json 字段自洽
    r = run("--skill", "wechat-article-to-ima", "--json")
    check("--skill wechat-article-to-ima --json 可执行", r.returncode == 0, r.stderr.strip()[:160])
    payload = None
    if r.returncode == 0:
        try:
            payload = json.loads(r.stdout)
        except json.JSONDecodeError as e:
            check("--json 输出为合法 JSON", False, str(e))
    check("--json 输出为合法 JSON", payload is not None)
    if payload:
        agg = payload.get("aggregate_md5", "")
        check("aggregate_md5 为 32 位 hex", isinstance(agg, str) and len(agg) == 32 and all(
            c in "0123456789abcdef" for c in agg), f"值={agg}")
        files = payload.get("files", 0)
        check("files 为整数且 > 0", isinstance(files, int) and files > 0, f"files={files}")
        check("totalBytes / totalLines / totalCr 均存在",
              all(k in payload for k in ("totalBytes", "totalLines", "totalCr")))
        check("per_file 含 sha（前 8 位）", bool(payload.get("per_file")) and "sha" in payload["per_file"][0])

    # 4) 口径自洽：wechat-article-to-ima 文件数须为 26（与 §7.2 已修复登记一致）
    if payload:
        check("wechat-article-to-ima 文件数 == 26", payload.get("files") == 26,
              f"实际 {payload.get('files')}（须与 §7.2 登记一致）")

    failed = [n for n, ok, _ in CHECKS if not ok]
    print(f"\n=== 结果：PASS={len(CHECKS) - len(failed)} FAIL={len(failed)} ===")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
