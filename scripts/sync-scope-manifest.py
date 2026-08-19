#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sync-scope-manifest.py —— AGENTS.md 第 2 章 scope 清单同步器。

用途：以「实际仓库结构」为唯一事实源，对照 AGENTS.md 第 2 章维护的 scope 清单，
     检测并（可选）修复不一致，确保分支命名（feat/<name>-...）与 pre-commit /
     sop_scope_check.sh 的 scope 校验基于同一份清单。

实际结构的扫描口径（与 scripts/smoke/common.py::discover_skills 一致）：
  - 目录型 dir/<目录名>：仓库根的一级子目录，且内含 SKILL.md；目录名 == SKILL.md 的 name 字段
  - 根级文件型 file/<name>：仓库根的 Skill-*.md 单文件；name 为其 frontmatter 的 name 字段

AGENTS.md 第 2 章格式（由 foundation 定稿）：
  - 2.1 目录型：行形如 `  - `dir/<目录名>``
  - 2.2 根级文件型：Markdown 表格 `| 文件名 | `name` |`
  - 2.3 meta / 2.4 排除 / 2.5 维护规则：固定文本，不参与扫描与重写

用法：
  python scripts/sync-scope-manifest.py           # --check（默认）：只报告差异，不改文件
  python scripts/sync-scope-manifest.py --update  # 重写 AGENTS.md 第 2 章 2.1/2.2 段，其余章节不动

退出码：
  0 = 清单一致（或 --update 执行成功）
  1 = --check 发现不一致（有差异）
  2 = 用法/解析错误
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

# 仓库根：scripts/sync-scope-manifest.py -> parents[1] == 仓库根
REPO_ROOT = Path(__file__).resolve().parents[1]
AGENTS_PATH = REPO_ROOT / "AGENTS.md"

sys.path.insert(0, str(REPO_ROOT / "scripts" / "smoke"))
from common import discover_skills  # noqa: E402

# 第 2 章固定文本的锚点
CH2_HEADER_RE = re.compile(r"^##\s*2\b")
CH_NEXT_RE = re.compile(r"^##\s+\d+\b")
CH2_1_RE = re.compile(r"^-\s*2\.1\b")
CH2_2_RE = re.compile(r"^-\s*2\.2\b")
CH2_3_RE = re.compile(r"^-\s*2\.3\b")

# 清单行解析
DIR_LINE_RE = re.compile(r"^\s*-\s*`dir/([^`]+)`")
FILE_TABLE_RE = re.compile(r"^\s*\| (.+?) \| `([a-z0-9-]+)` \|$")

# 固定的 meta / 排除集合（2.3/2.4 不扫描、不重写）
META_SET = ("scripts/", ".github/", "README.md", "CHANGELOG.md",
            "AGENTS.md", "Memory-Data/")

# 人工豁免保留的合集目录：无 SKILL.md，但作为合集目录（内含子 Skill）人工保留在
# 2.1 清单中，不纳入 discover_skills 口径，--check 不报差异、--update 整行保留。
MANUAL_KEEP_DIRS = ["Workbuddy专属"]


def scan_actual() -> Tuple[List[str], List[Tuple[str, str]]]:
    """按 discover_skills() 口径扫描实际结构。

    返回 (目录型目录名列表, 文件型 [(文件名, name)] 列表)，均按名称排序。
    """
    skills = discover_skills(REPO_ROOT)
    dirs = sorted({s.dir_name for s in skills if s.ftype == "dir" and s.dir_name})
    files = sorted(
        (s.path.name, s.name_field) for s in skills
        if s.ftype == "single" and s.path.name.endswith(".md") and s.name_field
    )
    return dirs, files


def parse_ch2(lines: List[str]) -> Optional[Tuple[int, int]]:
    """定位第 2 章范围 [start, end)，找不到返回 None。"""
    start = None
    for i, ln in enumerate(lines):
        if CH2_HEADER_RE.match(ln):
            start = i
            break
    if start is None:
        return None
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if CH_NEXT_RE.match(lines[i]):
            end = i
            break
    return start, end


def parse_existing(ch2_lines: List[str]) -> Tuple[List[str], List[Tuple[str, str]], List[str]]:
    """解析 AGENTS.md 第 2 章现有清单。

    返回 (目录型列表, 文件型 [(文件名, name)] 列表, 豁免目录原始行列表)。
    - 豁免目录原始行（含人工注释）在 --update 时整行保留，不重写。
    - 只扫描 2.1 段（dir 行）与 2.2 段（表格行），不越界。
    """
    dirs: List[str] = []
    files: List[Tuple[str, str]] = []
    manual_keep_lines: List[str] = []
    section = None  # None | "2.1" | "2.2" | "2.3+"
    for ln in ch2_lines:
        if CH2_1_RE.match(ln):
            section = "2.1"
            continue
        if CH2_2_RE.match(ln):
            section = "2.2"
            continue
        if CH2_3_RE.match(ln):
            section = "2.3+"
            continue
        if section == "2.1":
            m = DIR_LINE_RE.match(ln)
            if m:
                name = m.group(1).strip()
                dirs.append(name)
                if name in MANUAL_KEEP_DIRS:
                    manual_keep_lines.append(ln.rstrip())
        elif section == "2.2":
            m = FILE_TABLE_RE.match(ln)
            if m:
                files.append((m.group(1).strip(), m.group(2).strip()))
    return dirs, files, manual_keep_lines


def render_ch2(dir_list: List[str], file_list: List[Tuple[str, str]],
               manual_keep_lines: List[str]) -> List[str]:
    """按规范格式生成第 2 章的 2.1/2.2 段（不含标题行与 2.3+ 段）。

    - 2.1 段：实际扫描目录（discover_skills 口径）生成标准行，
      随后追加豁免目录的原始行（含人工注释），整行保留不重写；
      豁免目录若尚未出现在现有清单中则补一行标准条目。
    - 2.2 段：按实际扫描生成。
    """
    out: List[str] = []
    # 豁免目录若当前清单缺失，补标准行，确保 update 后仍出现在 2.1 段
    keep_lines = list(manual_keep_lines)
    keep_in_manifest = {DIR_LINE_RE.match(ln).group(1).strip()
                        for ln in keep_lines if DIR_LINE_RE.match(ln)}
    for d in MANUAL_KEEP_DIRS:
        if d not in keep_in_manifest:
            keep_lines.append(f"  - `dir/{d}`")

    auto_dirs = [d for d in dir_list if d not in MANUAL_KEEP_DIRS]
    out.append(f"- 2.1 目录型 Skill（{len(auto_dirs) + len(keep_lines)} 个，"
               f"scope 标识 `dir/<目录名>`）：")
    for d in auto_dirs:
        out.append(f"  - `dir/{d}`")
    for ln in keep_lines:
        out.append(ln)
    out.append(f"- 2.2 根级 Skill 文件（{len(file_list)} 个，scope 标识 `file/<name 字段>`）：")
    out.append("")
    out.append("  | 文件名 | name 字段 |")
    out.append("  |---|---|")
    for fname, name in file_list:
        out.append(f"  | {fname} | `{name}` |")
    return out


def diff_manifest(actual_dirs, actual_files, existing_dirs, existing_files):
    """比较实际结构 vs 现有清单。

    返回 (差异列表, 提示列表)：
      - 差异列表非空 = 清单与结构不一致（--check 退出码 1）
      - 提示列表仅作可读性说明，不影响退出码（如「目录存在但无 SKILL.md，按一般目录管理」）
    """
    diffs: List[str] = []
    notes: List[str] = []

    actual_dir_set = set(actual_dirs)
    existing_dir_set = set(existing_dirs)
    for d in actual_dirs:
        if d not in existing_dir_set:
            diffs.append(f"[新增] dir/{d}：实际结构存在（含 SKILL.md），但 AGENTS.md 2.1 清单缺失")
    for d in sorted(existing_dir_set - actual_dir_set):
        if (REPO_ROOT / d).is_dir():
            # 目录实际存在但无 SKILL.md（不在 discover_skills 口径内）：
            #   - 豁免目录（MANUAL_KEEP_DIRS）：合集目录人工保留，仅 info 说明，不阻断
            #   - 其它目录：按一般目录管理、不纳入 scope，提示而非报错
            if d in MANUAL_KEEP_DIRS:
                notes.append(
                    f"[信息] dir/{d}：豁免保留的合集目录（无 SKILL.md，人工维护，"
                    f"内含子 Skill），不纳入 discover_skills 口径")
            else:
                notes.append(
                    f"[提示] dir/{d}：目录存在但无 SKILL.md，按一般目录管理（不纳入 scope）")
        else:
            diffs.append(f"[缺失] dir/{d}：AGENTS.md 2.1 存在，但实际结构中无同名目录")

    actual_file_by_name = {name: fname for fname, name in actual_files}
    existing_file_by_name = {name: fname for fname, name in existing_files}
    all_names = sorted(set(actual_file_by_name) | set(existing_file_by_name))
    for name in all_names:
        actual_fn = actual_file_by_name.get(name)
        existing_fn = existing_file_by_name.get(name)
        if actual_fn and not existing_fn:
            diffs.append(f"[新增] file/{name}：实际结构存在（{actual_fn}），但 AGENTS.md 2.2 清单缺失")
        elif existing_fn and not actual_fn:
            diffs.append(f"[缺失] file/{name}：AGENTS.md 2.2 存在（{existing_fn}），但实际结构无此 Skill")
        elif actual_fn != existing_fn:
            diffs.append(
                f"[改名] file/{name}：文件名由「{existing_fn}」变为「{actual_fn}」")
    return diffs, notes


def rewrite_ch2(lines: List[str], new_head: List[str]) -> List[str]:
    """用 new_head 替换第 2 章中的 2.1/2.2 段，保留标题行与 2.3 及之后的行。"""
    span = parse_ch2(lines)
    if span is None:
        raise RuntimeError("AGENTS.md 中未找到 `## 2 Scope 清单` 章节")
    start, end = span
    keep_start = None
    for i in range(start + 1, end):
        if CH2_3_RE.match(lines[i]):
            keep_start = i
            break
    if keep_start is None:
        raise RuntimeError("AGENTS.md 第 2 章中未找到 `- 2.3` 段，拒绝重写以免破坏文档")
    return lines[: start + 1] + new_head + lines[keep_start:end] + lines[end:]


def main() -> int:
    ap = argparse.ArgumentParser(description="AGENTS.md 第 2 章 scope 清单同步器")
    ap.add_argument("--check", action="store_true",
                    help="只报告差异、不改文件（默认模式，显式传入亦无副作用）")
    ap.add_argument("--update", action="store_true",
                    help="重写 AGENTS.md 第 2 章 2.1/2.2 段（默认只报告差异）")
    args = ap.parse_args()

    if not AGENTS_PATH.is_file():
        print(f"❌ 未找到 AGENTS.md（期望路径: {AGENTS_PATH}）", file=sys.stderr)
        return 2

    actual_dirs, actual_files = scan_actual()
    lines = AGENTS_PATH.read_text(encoding="utf-8").splitlines()
    span = parse_ch2(lines)
    if span is None:
        print("❌ AGENTS.md 中未找到 `## 2 Scope 清单` 章节", file=sys.stderr)
        return 2
    start, end = span
    existing_dirs, existing_files, manual_keep_lines = parse_existing(lines[start:end])

    diffs, notes = diff_manifest(actual_dirs, actual_files, existing_dirs, existing_files)

    print("=== scope 清单同步检查 ===")
    print(f"实际结构   : 目录型 {len(actual_dirs)} 个 / 根级文件型 {len(actual_files)} 个")
    print(f"AGENTS.md  : 目录型 {len(existing_dirs)} 个 / 根级文件型 {len(existing_files)} 个")

    for n in notes:
        print(f"  {n}")

    if not diffs:
        if notes:
            print(f"结果       : ✅ 清单一致（{len(notes)} 条提示，不影响退出码）")
        else:
            print("结果       : ✅ 清单一致，无需同步")
        return 0

    print(f"结果       : ❌ 发现 {len(diffs)} 项不一致")
    for d in diffs:
        print(f"  {d}")

    if args.update:
        new_head = render_ch2(actual_dirs, actual_files, manual_keep_lines)
        new_lines = rewrite_ch2(lines, new_head)
        AGENTS_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        print("已执行     : ✅ 已用 scripts/sync-scope-manifest.py --update 重写 AGENTS.md 第 2 章 2.1/2.2 段")
        return 0

    print("已跳过     : 使用 --update 可自动重写 AGENTS.md 第 2 章 2.1/2.2 段")
    return 1


if __name__ == "__main__":
    sys.exit(main())
