#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 2 · 合规冒烟（复用 skill-checker 可自动化子集）。

skill-checker 共 11 维度，其中多数（如术语一致性、示例逻辑）需语义理解，难以脚本化。
本层聚焦可客观自动校验的维度：维度 1（frontmatter 完整）、维度 2.1（name↔目录）、
维度 3（渐进式加载）、维度 10（触发匹配）。

说明：description 五要素、触发短语多样性等以启发式代理检查，命中即 WARN，供人工复核；
完整 11 维度交互式校验仍可由 skill-checker 技能完成。
"""
from __future__ import annotations

import re
import sys

from common import REPO_ROOT, Report, discover_skills, name_valid, parse_frontmatter

TRIGGER_PATTERNS = [
    re.compile(r"当用户"), re.compile(r"当用户输入"), re.compile(r"时触发"),
    re.compile(r"触发此技能"), re.compile(r"关键词"),
]
CAPABILITY_VERBS = ["用于", "实现", "生成", "检查", "校验", "搜索", "分析", "提取",
                    "创建", "解析", "构建", "撰写", "管理", "处理", "转换", "同步"]
NEG_MARKERS = ["不适用", "不用于", "不适用于", "不适用场景"]
FUZZY_ENDINGS = ["等场景", "等需求", "等情境", "等相关"]


def run(rep: Report = None) -> Report:
    rep = rep or Report("Tier2")
    skills = discover_skills()
    for sk in skills:
        text = sk.path.read_text(encoding="utf-8", errors="replace")
        meta, body, has_fm, _ = parse_frontmatter(text)
        name = meta.get("name")
        desc = meta.get("description", "")

        # 维度 1：frontmatter 结构完整性
        if not has_fm:
            rep.fatal(sk.rel, "dim1-frontmatter", "缺少 YAML 前置元数据")
        if not name:
            rep.fatal(sk.rel, "dim1-name", "缺少 name")
        else:
            ok, probs = name_valid(name)
            for p in probs:
                rep.fatal(sk.rel, "dim1-name", p)
        if not desc:
            rep.fatal(sk.rel, "dim1-desc", "缺少 description")
        else:
            if not (1 <= len(desc) <= 1024):
                rep.fatal(sk.rel, "dim1-desc", f"description 长度 {len(desc)} 越界")
            if "\n" in desc or desc.lstrip().startswith(("|", ">")):
                rep.warn(sk.rel, "dim1-desc", "description 应为单行字符串")

        # 维度 2.1：name 与目录对应关系
        if sk.ftype == "dir" and name and sk.dir_name and name != sk.dir_name:
            rep.fatal(sk.rel, "dim2-name-dir", f"name({name}) ≠ 目录({sk.dir_name})")

        # 维度 3：渐进式加载适配
        if name and desc and (len(name) + len(desc) > 600):
            rep.info(sk.rel, "dim3-meta-size",
                     f"name+desc={len(name)+len(desc)}>600，元数据层偏重")
        if body.count("\n") + 1 > 500:
            rep.info(sk.rel, "dim3-body-len",
                     f"正文 {body.count(chr(10))+1} 行 > 500，建议拆分 references/")
        for m in re.finditer(r"(references|scripts|assets)[\\/][^\s)\"']+", body):
            tok = m.group(0)
            if tok.startswith("/") or re.match(r"^[A-Za-z]:", tok):
                rep.warn(sk.rel, "dim3-abs-path", f"引用使用绝对路径：{tok}")

        # 维度 10：触发匹配合理性（启发式）
        if desc:
            if not any(v in desc for v in CAPABILITY_VERBS):
                rep.warn(sk.rel, "dim10-keyword",
                         "description 未体现核心能力动词（用于/生成/检查…）")
            if not any(n in desc for n in NEG_MARKERS):
                rep.warn(sk.rel, "dim10-neg",
                         "description 缺少「不适用」负向场景描述")
            hits = sum(1 for p in TRIGGER_PATTERNS if p.search(desc))
            if hits < 2:
                rep.warn(sk.rel, "dim10-trigger",
                         f"触发条件表述单一（命中 {hits} 种），建议 ≥2 种")
            if any(fe in desc for fe in FUZZY_ENDINGS):
                rep.warn(sk.rel, "dim10-fuzzy",
                         "description 含模糊结尾（等场景/等需求）")
    return rep


if __name__ == "__main__":
    r = run()
    for f in r.findings:
        print(f"[{f.severity}] {f.skill}: {f.message}")
    sys.exit(1 if r.fatals else 0)
