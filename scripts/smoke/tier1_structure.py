#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 1 · 结构冒烟（纯静态，秒级）。

检查每个技能 SKILL.md / Skill-*.md：
  - 必填字段 name / description 存在且非空
  - name 符合 skill-checker 维度 1 格式（小写字母/数字/连字符，1–64 字符等）
  - description 长度 1–1024、单行
  - 目录技能：name 必须与父目录名一致（维度 2.1）
  - 正文引用的 references/ scripts/ assets/ 文件真实存在（断链检测）

支持 scope 过滤（方案 Y）：run(scope=dir/<目录名> / file/<name> / meta) 时
仅检查匹配该 scope 的 Skill；scope 为空时全量检查（向后兼容）。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from common import (REPO_ROOT, Report, Severity, discover_skills,
                    name_valid, parse_frontmatter)

DESC_MIN, DESC_MAX = 1, 1024
REF_RE = re.compile(r"\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)")          # markdown 链接
# 允许 references/scripts/assets 前带任意层级前缀目录段，避免把
# `{SKILL_ROOT}/anysearch-skill/scripts/x.py` 误截为 `scripts/x.py` 而产生假断链。
PATH_TOKEN_RE = re.compile(r"(?<![\w])(?:[\w.-]+[\\/])*(?:references|scripts|assets)[\\/][\w./\\-]+\.\w+")


def check_skill(sk, rep: Report) -> None:
    text = sk.path.read_text(encoding="utf-8", errors="replace")
    meta, body, has_fm, fenced = parse_frontmatter(text)

    if not has_fm:
        rep.fatal(sk.rel, "frontmatter", "缺少 YAML 前置元数据（无 name/description）")
        return
    if not fenced:
        rep.warn(sk.rel, "frontmatter-fence",
                 "frontmatter 未用标准 --- 围栏包裹，建议补充以兼容所有客户端")
    if not sk.name_field:
        rep.fatal(sk.rel, "frontmatter", "缺少必填字段 name")
        return
    ok, probs = name_valid(sk.name_field)
    for p in probs:
        rep.fatal(sk.rel, "name-format", p)

    desc = meta.get("description")
    if not desc:
        rep.fatal(sk.rel, "frontmatter", "缺少必填字段 description")
    else:
        if not (DESC_MIN <= len(desc) <= DESC_MAX):
            rep.fatal(sk.rel, "description", f"description 长度 {len(desc)} 不在 1–1024")
        if desc.lstrip().startswith(("|", ">")) or "\n" in desc:
            rep.warn(sk.rel, "description", "description 疑似多行块标量（应为单行字符串）")

    if sk.ftype == "dir" and sk.dir_name and sk.name_field != sk.dir_name:
        rep.fatal(sk.rel, "name-dir",
                  f"name={sk.name_field} 与目录名 {sk.dir_name} 不一致（维度 2.1）")

    # 断链检测（过滤明显非路径的畸形标记，如加粗/中文伪链接）
    base = sk.path.parent if sk.ftype == "dir" else REPO_ROOT
    checked = set()
    candidates = set(REF_RE.findall(body)) | set(PATH_TOKEN_RE.findall(body))
    for cand in candidates:
        if cand.startswith(("http://", "https://", "mailto:")):
            continue
        if cand.startswith("/") or re.match(r"^[A-Za-z]:", cand):
            continue
        cand_path = cand.split("#")[0]
        if not cand_path or cand_path in checked:
            continue
        # 跳过含空白/非 ASCII 的伪路径（多为畸形链接或正文）
        if any(c.isspace() for c in cand_path) or not all(ord(ch) < 128 for ch in cand_path):
            continue
        checked.add(cand_path)
        if not (base / cand_path).resolve().exists():
            rep.warn(sk.rel, "broken-link", f"引用文件不存在：{cand_path}")

    if not rep.fatals and not any(f.severity == Severity.WARN for f in rep.findings
                                  if f.skill == sk.rel):
        rep.ok(sk.rel, "structure", "结构合法")


def _filter_by_scope(skills, scope: str):
    """按 scope 过滤 Skill 列表（方案 Y scope 纪律）。

    - scope 为空 / "all"：不过滤（全量，向后兼容）
    - dir/<目录名>：仅保留目录型且目录名匹配的 Skill
    - file/<name> ：仅保留根级单文件且 name 字段匹配的 Skill
    - meta        ：无技能级检查，返回空列表（由调用方跳过技能检查）
    """
    if not scope or scope == "all":
        return skills
    if scope.startswith("dir/"):
        name = scope[len("dir/"):]
        return [s for s in skills if s.ftype == "dir" and s.dir_name == name]
    if scope.startswith("file/"):
        name = scope[len("file/"):]
        return [s for s in skills if s.ftype == "single" and s.name_field == name]
    return []   # meta 及其它无法映射到技能的值：无技能级检查


def run(rep: Report = None, scope: str = None) -> Report:
    rep = rep or Report("Tier1")
    skills = _filter_by_scope(discover_skills(), scope)
    if not skills:
        if scope and scope.startswith(("dir/", "file/")):
            # 具体 scope 却无匹配：说明 scope 判定与清单/结构脱节，需暴露
            rep.fatal("__repo__", "discovery",
                      f"scope {scope} 未匹配任何 Skill（清单与结构不一致？）")
        elif scope == "meta":
            rep.info("__repo__", "discovery",
                     "meta scope 无技能级检查，跳过 Tier1 结构检查")
        else:
            rep.fatal("__repo__", "discovery",
                      "未发现任何 Skill（SKILL.md / Skill-*.md）")
        return rep
    suffix = f"（scope={scope}）" if scope and scope != "all" else ""
    rep.info("__repo__", "discovery", f"发现 {len(skills)} 个 Skill{suffix}")
    for sk in skills:
        check_skill(sk, rep)
    return rep


if __name__ == "__main__":
    r = run()
    for f in r.findings:
        print(f"[{f.severity}] {f.skill}: {f.message}")
    sys.exit(1 if r.fatals else 0)
