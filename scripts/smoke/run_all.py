#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""run_all.py —— 冒烟测试编排器（含 scope 纪律 CI）。

用法：
  uv run --with requests python scripts/smoke/run_all.py                 # 运行全部分层（全 scope）
  uv run --with requests python scripts/smoke/run_all.py --tier 0,1      # 仅运行 Tier0 + Tier1（预提交钩子场景）
  uv run --with requests python scripts/smoke/run_all.py --tier 0,1,2,3  # CI 场景（不含行为级 Tier4）
  uv run --with requests python scripts/smoke/run_all.py --tier 1,2 --scope dir/chrome-devtools  # CI 按 scope 过滤
  uv run --with requests python scripts/smoke/run_all.py --scope meta    # 仅检查 meta 相关项
  uv run --with requests python scripts/smoke/run_all.py --list          # 仅列出发现的 Skill
  uv run --with requests python scripts/smoke/run_all.py --strict        # WARN 也视为失败
  uv run --with requests python scripts/smoke/run_all.py --json out.json # 输出 JSON 报告

scope 取值（方案 Y 纪律）：
  dir/<目录名>   —— 目录型 Skill（如 dir/chrome-devtools）
  file/<name>    —— 根级单文件 Skill（如 file/skill-forge）
  meta           —— 共享/元 scope（scripts/ .github/ README/CHANGELOG/AGENTS/Memory-Data）
  all / 缺省     —— 全部（不按 scope 过滤）

scope 兼容约定：编排器向各 tier 的 run() 传可选参数 scope=…；tier 实现若接受该
参数则自行过滤，不接受（签名无 scope）则通过 TypeError 回退为普通 run() 调用，
保证既有 tier 行为完全不变。

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
import tier5_scope_consistency

TIERS = {
    "0": ("Tier0 密钥/忽略门禁", tier0_secrets),
    "1": ("Tier1 结构冒烟", tier1_structure),
    "2": ("Tier2 合规冒烟", tier2_compliance),
    "3": ("Tier3 运行冒烟", tier3_runtime),
    "4": ("Tier4 触发冒烟", tier4_trigger),
    "5": ("Tier5 纪律一致性", tier5_scope_consistency),
}

# scope 合法前缀：dir/ file/ meta（其余值视为非法参数）
_SCOPE_PREFIXES = ("dir/", "file/")


def _call_tier(mod, *, scope, files=None):
    """调用某 tier 的 run()，scope 兼容：接受即过滤，不接受即忽略。

    - Tier0 在 --staged 场景额外传 files；
    - 若 tier 的 run() 未定义 scope 参数（旧实现），捕获 TypeError 回退为普通调用，
      保持其原有行为不破坏。
    """
    kwargs = {}
    if files is not None:
        kwargs["files"] = files
    if scope is not None:
        kwargs["scope"] = scope
    try:
        return mod.run(**kwargs)
    except TypeError:
        # 兼容旧 tier：不接受 scope/files 关键字的实现按原有签名调用
        return mod.run(files=files) if files is not None else mod.run()


def main() -> int:
    ap = argparse.ArgumentParser(description="AI_MCP-Skill-CLI 冒烟测试（含 scope 纪律）")
    ap.add_argument("--tier", default="0,1,2,3,4,5",
                    help="运行层级，逗号分隔，如 0,1 或 all")
    ap.add_argument("--scope", default=None,
                    help="按 scope 过滤：dir/<目录名> / file/<name> / meta / all / 缺省=全部")
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

    # scope 参数合法性校验
    if args.scope is not None and args.scope not in ("all", "meta"):
        if not args.scope.startswith(_SCOPE_PREFIXES):
            print(f"非法 scope: {args.scope}（应为 dir/<目录名> / file/<name> / meta / all）",
                  file=sys.stderr)
            return 2

    selected = list(TIERS.keys()) if args.tier == "all" \
        else [t.strip() for t in args.tier.split(",")]

    all_reports: list[Report] = []
    for t in selected:
        if t not in TIERS:
            print(f"未知层级: {t}", file=sys.stderr)
            return 2
        label, mod = TIERS[t]
        print(f"\n=== {label} ===")
        if args.scope:
            print(f"  scope = {args.scope}")
        files = staged_files() if (t == "0" and args.staged) else None
        rep = _call_tier(mod, scope=args.scope, files=files)
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
                        "scope": args.scope or "all",
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
