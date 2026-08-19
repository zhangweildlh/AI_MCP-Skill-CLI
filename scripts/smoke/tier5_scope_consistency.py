#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 5 · 纪律一致性（AGENTS.md 结构 + scope 清单）。

方案 Y「多 Agent 并发 scope 纪律」的机器守卫，纯静态、秒级：

  检查项 A：AGENTS.md 必须存在（缺失 → FATAL，附恢复命令）。
  检查项 B：AGENTS.md 六章标题（## 0 … ## 6）必须齐全（缺失 → FATAL）。
  检查项 C：AGENTS.md 第 2 章 scope 清单 与 discover_skills() 实际结构一致性
            —— 新增未登记 / 已登记缺失 / name 不一致 → FATAL 或 WARN，
            附修复指令「请运行 python scripts/sync-scope-manifest.py --update」。
  检查项 D：纪律必须文件存在性（.githooks/pre-commit、scripts/install-hooks.sh、
            scripts/sync-scope-manifest.py 等 → 缺失 FATAL）。

scope 过滤：
  - scope 为 None / "all" / "meta"：全量执行 A/B/C/D；
  - scope 为 dir/<目录名> 或 file/<name>：执行 A，C 仅校验对应条目；
    仅与该 skill 无关的 B（章节齐全性）/ D（meta 基础设施）跳过。
"""
from __future__ import annotations

import re
import sys

from common import REPO_ROOT, Report, discover_skills, parse_frontmatter

AGENTS_FILE = "AGENTS.md"
AGENTS_PATH = REPO_ROOT / AGENTS_FILE

# ---- 修复指令（与 scripts/sync-scope-manifest.py --update 保持一致）----
FIX_CMD = "python scripts/sync-scope-manifest.py --update"
RECOVER_CMD = "git checkout main -- AGENTS.md"

# ---- 纪律必须文件（方案 Y 基础设施）----
MUST_FILES = [
    ".githooks/pre-commit",                 # 提交门禁钩子
    "scripts/install-hooks.sh",             # 钩子安装脚本（方案 Y 新增）
    "scripts/sync-scope-manifest.py",       # scope 清单同步脚本（方案 Y 新增）
    "scripts/smoke/run_all.py",             # 冒烟编排器
    "scripts/smoke/common.py",              # 冒烟共享工具
    ".github/workflows/smoke.yml",          # CI 工作流
]

# 第 2 章中目录型条目：- `dir/<目录名>`
_DIR_SCOPE_RE = re.compile(r"^\s*[-*]\s*`dir/([^`]+)`", re.M)
# 第 2 章中根级文件表格行：| Skill-xxx.md | `name` |（允许行首缩进）
_FILE_TABLE_RE = re.compile(
    r"^\s*\|\s*(Skill-[^|\n]+?\.md)\s*\|\s*`([^`]+)`\s*\|", re.M)
# 章节标题：## 0 … ## 6（后必须跟空白，避免误吞 ## 10 等）
_HEADING_RE = re.compile(r"^## ([0-6])\s", re.M)


def _extract_chapter(text: str, num: str) -> str:
    """提取 ``## num`` 章节正文（含标题行），到下一个 ``## N`` 为止。"""
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines)
                  if re.match(rf"^## {num}\s", ln)), None)
    if start is None:
        return ""
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if re.match(r"^## [0-9]\s", lines[i]):
            end = i
            break
    return "\n".join(lines[start:end])


def _parse_manifest(ch2: str):
    """解析第 2 章 → (dir_manifest, file_manifest)。

    dir_manifest：set[目录名]（Workbuddy专属 等无 SKILL.md 条目也计入）
    file_manifest：dict[文件名] -> name 字段
    """
    dirs = set(_DIR_SCOPE_RE.findall(ch2))
    files = {fn: nm for fn, nm in _FILE_TABLE_RE.findall(ch2)}
    return dirs, files


def check_agents_exists(rep: Report) -> bool:
    """检查项 A：AGENTS.md 必须存在。返回是否继续后续检查。"""
    if AGENTS_PATH.is_file():
        rep.ok("__repo__", "agents-exists", f"{AGENTS_FILE} 存在 ✓")
        return True
    rep.fatal("__repo__", "agents-exists",
              f"缺失 {AGENTS_FILE}（方案 Y 纪律单一事实源）。"
              f"恢复命令：{RECOVER_CMD}")
    return False


def check_chapters(rep: Report, text: str) -> None:
    """检查项 B：AGENTS.md 六章标题必须齐全。"""
    found = set(_HEADING_RE.findall(text))
    for n in "0123456":
        if n in found:
            rep.ok(AGENTS_FILE, f"chapter-{n}", f"第 {n} 章标题存在 ✓")
        else:
            rep.fatal(AGENTS_FILE, f"chapter-{n}",
                      f"缺少章节标题 `## {n}`（六章必须齐全）。")


def _check_dir_entry(rep: Report, name: str, manifest: set,
                     actual_by_dir: dict, skills_by_dir: dict) -> None:
    """校验单个目录型 scope 条目的一致性。"""
    if name not in manifest:
        rep.fatal(f"dir/{name}", "scope-registered",
                  f"目录 {name} 未在 AGENTS.md 第 2 章登记。"
                  f"修复指令：请运行 {FIX_CMD}")
    d = REPO_ROOT / name
    if not d.is_dir():
        rep.fatal(f"dir/{name}", "scope-missing",
                  f"已登记但目录缺失：{name}。修复指令：请运行 {FIX_CMD}")
        return
    if (d / "SKILL.md").is_file():
        # 有 SKILL.md：应与 discover_skills 一致，且 name 与目录名一致
        if name not in actual_by_dir:
            rep.fatal(f"dir/{name}", "scope-consistency",
                      f"目录 {name} 含 SKILL.md 但未被 discover_skills() 发现。"
                      f"修复指令：请运行 {FIX_CMD}")
            return
        actual_name = skills_by_dir.get(name)
        if actual_name is not None and actual_name != name:
            rep.fatal(f"dir/{name}", "scope-name",
                      f"name 不一致：SKILL.md name={actual_name}，"
                      f"目录名={name}。修复指令：请运行 {FIX_CMD}")
        else:
            rep.ok(f"dir/{name}", "scope-dir", "目录型 scope 一致 ✓")
    else:
        # 无 SKILL.md（如 Workbuddy专属：内部含 Skill-*.md，按目录 scope 处理）
        rep.info(f"dir/{name}", "scope-dir",
                 f"目录 {name} 无 SKILL.md，按目录 scope 处理（清单已登记）")


def _check_file_entry(rep: Report, filename: str, expected_name: str,
                      manifest_names: set, actual_by_name: dict) -> None:
    """校验单个根级文件 scope 条目的一致性。"""
    p = REPO_ROOT / filename
    if not p.is_file():
        rep.fatal(f"file/{expected_name}", "scope-missing",
                  f"已登记但文件缺失：{filename}。修复指令：请运行 {FIX_CMD}")
        return
    if expected_name not in manifest_names:
        rep.fatal(f"file/{expected_name}", "scope-registered",
                  f"文件 {filename}（name={expected_name}）未在 AGENTS.md 第 2 章登记。"
                  f"修复指令：请运行 {FIX_CMD}")
    actual_name = actual_by_name.get(filename)
    if actual_name is None:
        rep.fatal(f"file/{expected_name}", "scope-consistency",
                  f"文件 {filename} 未被 discover_skills() 发现。"
                  f"修复指令：请运行 {FIX_CMD}")
    elif actual_name != expected_name:
        rep.fatal(f"file/{expected_name}", "scope-name",
                  f"name 不一致：frontmatter name={actual_name}，"
                  f"清单登记={expected_name}（文件 {filename}）。"
                  f"修复指令：请运行 {FIX_CMD}")
    else:
        rep.ok(f"file/{expected_name}", "scope-file", "根级文件 scope 一致 ✓")


def check_scope_consistency(rep: Report, text: str, scope: str) -> None:
    """检查项 C：第 2 章 scope 清单 与 实际结构 一致性。"""
    ch2 = _extract_chapter(text, "2")
    if not ch2:
        rep.fatal(AGENTS_FILE, "scope-chapter", "缺少第 2 章「Scope 清单」章节。"
                  f"修复指令：请运行 {FIX_CMD}")
        return

    manifest_dirs, manifest_files = _parse_manifest(ch2)
    skills = discover_skills()
    # 实际结构索引
    actual_by_dir = {sk.dir_name for sk in skills if sk.ftype == "dir"}
    skills_by_dir = {sk.dir_name: sk.name_field for sk in skills
                     if sk.ftype == "dir"}
    actual_files = {sk.path.name for sk in skills if sk.ftype == "single"}
    names_by_file = {sk.path.name: sk.name_field for sk in skills
                     if sk.ftype == "single"}

    rep.info("__repo__", "scope-discovery",
             f"清单登记：目录 {len(manifest_dirs)} / 文件 {len(manifest_files)}；"
             f"实际发现：目录 {len(actual_by_dir)} / 文件 {len(actual_files)}")

    if scope and scope.startswith("dir/"):
        # scope 过滤：仅校验该目录条目
        name = scope[len("dir/"):]
        _check_dir_entry(rep, name, manifest_dirs, actual_by_dir,
                         skills_by_dir)
        return
    if scope and scope.startswith("file/"):
        # scope 过滤：仅校验该 name 对应的文件条目
        name = scope[len("file/"):]
        hit = next((fn for fn, nm in manifest_files.items() if nm == name), None)
        if hit:
            _check_file_entry(rep, hit, name, set(manifest_files.values()),
                              names_by_file)
        else:
            # 清单未登记该 name：按实际文件查找，判定是否新增未登记
            hit_file = next((fn for fn, nm in names_by_file.items()
                             if nm == name), None)
            if hit_file:
                rep.fatal(f"file/{name}", "scope-registered",
                          f"Skill {hit_file}（name={name}）未在 AGENTS.md 第 2 章登记。"
                          f"修复指令：请运行 {FIX_CMD}")
            else:
                rep.fatal(f"file/{name}", "scope-missing",
                          f"scope file/{name} 未在清单登记且无对应 Skill 文件。"
                          f"修复指令：请运行 {FIX_CMD}")
        return

    # ---- 全量校验（scope 为 None / all / meta）----
    # 1) 新增未登记：实际存在但清单缺失
    for name in sorted(actual_by_dir - manifest_dirs):
        rep.fatal(f"dir/{name}", "scope-registered",
                  f"新增目录型 Skill 未登记：dir/{name}。"
                  f"修复指令：请运行 {FIX_CMD}")
    for fn in sorted(actual_files - set(manifest_files)):
        rep.fatal(f"file/{names_by_file.get(fn, fn)}", "scope-registered",
                  f"新增根级 Skill 文件未登记：{fn}"
                  f"（name={names_by_file.get(fn)}）。"
                  f"修复指令：请运行 {FIX_CMD}")
    # 2) 已登记缺失 + name 不一致
    for name in sorted(manifest_dirs):
        _check_dir_entry(rep, name, manifest_dirs, actual_by_dir,
                         skills_by_dir)
    for fn, nm in manifest_files.items():
        _check_file_entry(rep, fn, nm, set(manifest_files.values()),
                          names_by_file)


def check_must_files(rep: Report) -> None:
    """检查项 D：纪律必须文件存在性。"""
    for rel in MUST_FILES:
        if (REPO_ROOT / rel).is_file():
            rep.ok(rel, "must-file", "必须文件存在 ✓")
        else:
            rep.fatal(rel, "must-file",
                      f"缺失纪律必须文件 {rel}（方案 Y 基础设施）。"
                      f"请从主分支恢复或由对应职责 Agent 补齐。")


def run(rep: Report = None, scope: str = None) -> Report:
    rep = rep or Report("Tier5")
    if not check_agents_exists(rep):
        return rep

    text = AGENTS_PATH.read_text(encoding="utf-8", errors="replace")

    # B 章节齐全性：仅全量/meta 场景校验（具体 skill scope 与章节结构无关）
    if scope in (None, "all", "meta"):
        check_chapters(rep, text)

    # C scope 清单一致性：始终执行（scope 过滤时仅校验对应条目）
    check_scope_consistency(rep, text, scope)

    # D 纪律必须文件：meta 基础设施，仅全量/meta 场景校验
    if scope in (None, "all", "meta"):
        check_must_files(rep)

    return rep


if __name__ == "__main__":
    r = run()
    for f in r.findings:
        print(f"[{f.severity}] {f.skill}: {f.message}")
    sys.exit(1 if r.fatals else 0)
