#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""run_all.py —— 五层冒烟测试编排器。

用法：
  uv run --with requests python scripts/smoke/run_all.py                 # 运行全部分层
  uv run --with requests python scripts/smoke/run_all.py --tier 0,1      # 仅运行 Tier0 + Tier1（预提交钩子场景）
  uv run --with requests python scripts/smoke/run_all.py --tier 0,1,2,3  # CI 场景（不含行为级 Tier4）
  uv run --with requests python scripts/smoke/run_all.py --list          # 仅列出发现的 Skill
  uv run --with requests python scripts/smoke/run_all.py --strict        # WARN 也视为失败
  uv run --with requests python scripts/smoke/run_all.py --json out.json # 输出 JSON 报告

退出码：0 = 通过；1 = 存在致命(或 strict 下存在警告)；2 = 参数/用法错误。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import REPO_ROOT, Report, Severity, discover_skills, staged_files

import tier0_secrets
import tier1_structure
import tier2_compliance
import tier3_runtime
import tier4_trigger

TIERS = {
    "0": ("Tier0 密钥/忽略门禁", tier0_secrets),
    "1": ("Tier1 结构冒烟", tier1_structure),
    "2": ("Tier2 合规冒烟", tier2_compliance),
    "3": ("Tier3 运行冒烟", tier3_runtime),
    "4": ("Tier4 触发冒烟", tier4_trigger),
}


def main() -> int:
    ap = argparse.ArgumentParser(description="AI_MCP-Skill-CLI 五层冒烟测试")
    ap.add_argument("--tier", default="0,1,2,3,4",
                    help="运行层级，逗号分隔，如 0,1 或 all")
    ap.add_argument("--json", help="输出 JSON 报告路径")
    ap.add_argument("--strict", action="store_true", help="WARN 也视为失败")
    ap.add_argument("--list", action="store_true", help="仅列出发现的 Skill 并退出")
    ap.add_argument("--staged", action="store_true",
                    help="Tier0 仅扫描已暂存(staged)文件（预提交钩子场景）")
    args = ap.parse_args()

    if args.list:
        for sk in discover_skills():
            print(f"{sk.ftype:6} {sk.rel:52} name={sk.name_field}")
        return 0

    selected = list(TIERS.keys()) if args.tier == "all" \
        else [t.strip() for t in args.tier.split(",")]

    all_reports: list[Report] = []
    for t in selected:
        if t not in TIERS:
            print(f"未知层级: {t}", file=sys.stderr)
            return 2
        label, mod = TIERS[t]
        print(f"\n=== {label} ===")
        rep = mod.run(files=staged_files()) if (t == "0" and args.staged) else mod.run()
        all_reports.append(rep)
        for f in rep.findings:
            print(f"  [{f.severity}] {f.skill}: {f.message}")

    fatals = [(f.skill, f.message) for r in all_reports
              for f in r.findings if f.severity == Severity.FATAL]
    warns = [(f.skill, f.message) for r in all_reports
             for f in r.findings if f.severity == Severity.WARN]
    oks = sum(1 for r in all_reports for f in r.findings if f.severity == Severity.OK)

    print("\n=== 汇总 ===")
    print(f"通过(OK): {oks}  致命(FATAL): {len(fatals)}  警告(WARN): {len(warns)}")
    if args.strict:
        print("（strict 模式：警告亦视为失败）")

    if args.json:
        payload = {
            "summary": {"ok": oks, "fatal": len(fatals), "warn": len(warns),
                        "strict": args.strict,
                        "failed": bool(fatals) or (args.strict and bool(warns))},
            "tiers": {TIERS[t][0]: [vars(f) for f in all_reports[i].findings]
                      for i, t in enumerate(selected)},
        }
        Path(args.json).write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                                   encoding="utf-8")
        print(f"JSON 报告已写入 {args.json}")

    failed = bool(fatals) or (args.strict and bool(warns))
    print("结果：" + ("❌ 失败" if failed else "✅ 通过"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
