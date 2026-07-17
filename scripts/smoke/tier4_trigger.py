#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 4 · 触发冒烟（触发就绪度静态校验）。

完整的行为级触发验证需要 LLM 运行时（把样例输入喂给模型，确认预期技能被激活）。
本层提供轻量、可脚本化的「触发就绪度」检查：

  - description 是否包含明确触发短语（当用户 / 时触发 / 关键词 等）
  - 正文是否含「示例」章节（典型场景样例）
  - 触发关键词互斥性：若多个技能抢占同一触发关键词，给出 WARN（潜在误触发）

本层仅产生 WARN / INFO，不阻断——行为级验证建议结合真实运行时补充。
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict

from common import REPO_ROOT, Report, discover_skills, parse_frontmatter

# 各技能预期触发关键词（用于互斥性检查；可随仓库演进补充）
EXPECTED_TRIGGERS = {
    "skill-creator": ["创建", "元技能", "skill"],
    "skill-checker": ["校验", "审查", "检查"],
    "github-repo-sync": ["同步", "github"],
    "ticktick": ["滴答", "清单", "提醒", "任务"],
    "multi-file-analysis": ["多文件", "知识图谱", "分析"],
    "find-skill-to-xml": ["扫描", "xml", "标签"],
    "promotion-writer": ["推广", "文案", "文章"],
    "anysearch-skill": ["搜索", "anysearch"],
    "web-search": ["联网搜索", "网页抓取"],
    "ref-material-writing": ["参考资料", "撰写", "写作"],
    "github-personal-manager": ["github", "仓库", "pr"],
    "tender-review-kit": ["招标", "投标", "审标"],
}


def run(rep: Report = None) -> Report:
    rep = rep or Report("Tier4")
    skills = discover_skills()
    trigger_index = {}
    for sk in skills:
        text = sk.path.read_text(encoding="utf-8", errors="replace")
        meta, body, _, _ = parse_frontmatter(text)
        name = meta.get("name", "")
        desc = meta.get("description", "")
        if not re.search(r"(当用户|当用户输入|时触发|触发此技能|关键词)", desc):
            rep.warn(sk.rel, "trigger-phrase", "description 未出现明确触发短语")
        if not re.search(r"^#{1,3}\s*示例", body, re.M):
            rep.info(sk.rel, "example", "正文缺少「示例」章节（建议补充典型场景）")
        trigger_index[name] = desc

    kw_map = defaultdict(list)
    for name, desc in trigger_index.items():
        for kw in EXPECTED_TRIGGERS.get(name, []):
            kw_map[kw].append(name)
    for kw, names in kw_map.items():
        if len(names) > 1:
            rep.info("__index__", "trigger-overlap",
                     f"触发关键词「{kw}」被多技能共享：{names}")

    if trigger_index:
        rep.info("__index__", "trigger-index",
                 f"已索引 {len(trigger_index)} 个技能的触发描述")
    return rep


if __name__ == "__main__":
    r = run()
    for f in r.findings:
        print(f"[{f.severity}] {f.skill}: {f.message}")
    sys.exit(1 if r.fatals else 0)
