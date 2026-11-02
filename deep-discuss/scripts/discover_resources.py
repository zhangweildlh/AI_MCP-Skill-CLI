#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deep-discuss 资源路径发现器（技能自带，随技能分发）

【问题背景】
  技能内部资源（增强模块方法论文档、配套模板）在正文中均以
  「技能根相对路径」（references/enhancements/*.md、assets/templates/*.md）
  记载。但模型执行本技能时，其工作目录是对话工作区，未必是技能目录；
  若直接对相对路径做 Glob/ls，会解析到错误位置，导致误报"模块未找到"
  并错误降级 Phase 2/3/5 增强（这正是 P3-04 类错判的根因）。

【本脚本的作用】
  以脚本自身位置为锚（Path(__file__).resolve().parent.parent），始终能
  求出技能根的绝对路径，并输出所有内部资源的【绝对路径】清单，供模型
  按清单中的绝对路径读取，彻底规避 CWD 漂移问题。

退出码：技能根有效且能列出资源为 0；技能根无效为 1。
"""

import sys
from pathlib import Path

# 技能根 = 本脚本所在 scripts/ 的上一级（与 selfcheck.py 同源锚定）
SKILL_ROOT = Path(__file__).resolve().parent.parent

# 增强模块的语义标签（让模型一眼知道每个文件用途）
ENHANCEMENT_LABELS = {
    "jasminK11-5why.md": "5Why 模块（Phase 3 深度分析）",
    "kimasplund-premortem.md": "Premortem 模块（Phase 5/6 方案自检）",
    "silvereWolf-consult.md": "Consult 模块（Phase 2 问题审查）",
    "sequential-thinking-adapter.md": "思维审计层适配文档（运行时探测，非版本锁定）",
}
# 配套模板的语义标签
TEMPLATE_LABELS = {
    "audit-template.md": "审计模板（Consult 配套）",
    "5why-template.md": "5Why 模板（5Why 配套）",
    "premortem-template.md": "事前验尸模板（Premortem 配套）",
}


def main():
    print("=" * 64)
    print("deep-discuss · 资源路径发现器（输出绝对路径，规避 CWD 漂移）")
    print("=" * 64)
    print(f"技能根(绝对): {SKILL_ROOT}")
    if not SKILL_ROOT.is_dir():
        print(f"[FAIL] 技能根目录无效: {SKILL_ROOT}")
        sys.exit(1)

    enh_dir = SKILL_ROOT / "references" / "enhancements"
    tpl_dir = SKILL_ROOT / "assets" / "templates"

    print("\n【增强模块方法论文档】references/enhancements/")
    if enh_dir.is_dir():
        hits = sorted(enh_dir.glob("*.md"))
        if not hits:
            print("  [FAIL] 该目录下未找到任何 .md 文件")
        for p in hits:
            label = ENHANCEMENT_LABELS.get(p.name, "（未登记标签）")
            print(f"  - {p.resolve()}  # {label}")
    else:
        print(f"  [FAIL] 目录不存在: {enh_dir}")

    print("\n【配套模板】assets/templates/")
    if tpl_dir.is_dir():
        hits = sorted(tpl_dir.glob("*.md"))
        if not hits:
            print("  [FAIL] 该目录下未找到任何 .md 文件")
        for p in hits:
            label = TEMPLATE_LABELS.get(p.name, "（未登记标签）")
            print(f"  - {p.resolve()}  # {label}")
    else:
        print(f"  [FAIL] 目录不存在: {tpl_dir}")

    print("")
    print("【使用纪律（重要）】")
    print("  1) 请按上方【绝对路径】用 Read 工具读取对应文档；")
    print("  2) 严禁对相对路径 references/enhancements/*.md 或 assets/templates/*.md")
    print("     直接 Glob/ls——执行本技能时的工作目录未必是技能根目录，相对路径")
    print("     会解析到错误位置，导致误报『模块未找到』而错误降级；")
    print("  3) 亦可取『本 SKILL.md 所在目录』的绝对路径作为技能根，再拼接子路径。")
    sys.exit(0)


if __name__ == "__main__":
    main()
