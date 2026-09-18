#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 6 · 版本锁一致性门禁（version-lock consistency gate）。

针对仓库内所有含 version-lock.md 的技能，校验版本锁定清单与缓存模块的三处易漂链路
（方案：deep-discuss v2.0 加载时自检的机器化落点，纯标准库实现，秒级、无网络依赖）：

  检查项 ① 首行↔锁表：每个缓存模块文件首行 `<!-- 版本锁定: commit:<hash> -->` 的
            commit 必须作为子串出现在 version-lock.md 锁定表中；缺失 → FATAL。
  检查项 ② 更新记录↔首行：模块「更新记录」小节引用的 `基于 <repo>@<commit>` 的
            commit 须与首行 commit 完全一致；不一致 → FATAL。模块正文含版本占位符
            （如 `<真实commit>` / `xxxxxx` / `待填` / `TODO`）→ FATAL（防占位符遗留）。
  检查项 ③ 主干锁↔main HEAD：version-lock.md「主干」行 commit 须等于
            `git rev-parse --short main`；若不等但已显式标注为历史快照
            （含"快照"/"snapshot"/"随 main 演进"字样）→ WARN（非阻断，提醒刷新），
            否则 → FATAL（疑似版本锁过期）。

scope 过滤（方案 Y）：dir/<目录名> 仅校验该技能；file/<name> 仅校验该单文件技能；
meta/None/all 全量校验所有含 version-lock.md 的技能。无 version-lock.md 的技能自动跳过。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from common import REPO_ROOT, Report, Severity, discover_skills, git

# 模块首行版本标记：<!-- 版本锁定: commit:xxxx -->
FIRST_LINE_RE = re.compile(r"commit:([0-9a-f]+)", re.I)
# 模块「更新记录」引用：基于 <repo>@<commit>
UPDATE_REC_RE = re.compile(r"基于\s+\S+@([0-9a-f]+)", re.I)
# version-lock.md「主干」行：| 主干 | 自身 | commit:xxxx |
TRUNK_LOCK_RE = re.compile(
    r"^\|\s*主干\s*\|\s*自身\s*\|\s*commit:([0-9a-f]+)", re.M | re.I)
# 版本占位符（刻意不含合法版本标记的 `<!-- 版本锁定: commit:<hash> -->` 形态；
# 也不匹配合法的 JSON 键 `placeholders` —— 仅拦截常见的版本占位写法）
PLACEHOLDER_RE = re.compile(
    r"<真实\s*commit>|<commit>|待填|TODO|x{6,}", re.I)
# 历史快照标注（检查项 ③ 的宽松豁免依据）
SNAPSHOT_MARKERS = ("快照", "snapshot", "随 main 演进", "历史快照", "snapshot-locked")

MODULE_DIR = "references/enhancements"


def _first_commit(path: Path) -> str:
    """读取模块文件首行的 commit（无则空串）。"""
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    if not lines:
        return ""
    m = FIRST_LINE_RE.search(lines[0])
    return m.group(1) if m else ""


def check_skill(sk, rep: Report, main_short: str) -> None:
    """对单个含 version-lock.md 的技能执行三链路校验。"""
    base = sk.base  # 技能根目录
    vl = base / "version-lock.md"
    if not vl.is_file():
        return
    skill_label = sk.rel if sk.ftype == "dir" else sk.path.name
    lock_text = vl.read_text(encoding="utf-8", errors="replace")

    # 检查项 ① + ②：扫描缓存模块文件
    mod_dir = base / MODULE_DIR
    modules = sorted(mod_dir.glob("*.md")) if mod_dir.is_dir() else []
    if not modules:
        rep.info(skill_label, "versionlock",
                 "version-lock.md 存在但无缓存模块目录，跳过 ①②")
    for m in modules:
        commit = _first_commit(m)
        if not commit:
            rep.warn(skill_label, "versionlock-firstline",
                     f"模块 {m.name} 首行缺少版本标记 "
                     f"`<!-- 版本锁定: commit:... -->`")
            continue
        # ① 首行↔锁表
        if commit not in lock_text:
            rep.fatal(skill_label, "versionlock-table",
                      f"模块 {m.name} 首行 commit {commit[:10]}… "
                      f"未出现在 version-lock.md 锁定表")
        # ② 更新记录↔首行 + 占位符检测
        body = m.read_text(encoding="utf-8", errors="replace")
        for r in UPDATE_REC_RE.findall(body):
            if r != commit:
                rep.fatal(skill_label, "versionlock-updaterec",
                          f"模块 {m.name} 更新记录 commit {r[:10]}… "
                          f"与首行 {commit[:10]}… 不一致")
        if PLACEHOLDER_RE.search(body):
            rep.fatal(skill_label, "versionlock-placeholder",
                      f"模块 {m.name} 正文含版本占位符"
                      f"（如 <真实commit>/xxxxxx/待填），须替换为真实 commit")

    # 检查项 ③ 主干锁↔main HEAD
    tm = TRUNK_LOCK_RE.search(lock_text)
    if not tm:
        rep.warn(skill_label, "versionlock-trunk",
                 "version-lock.md 未找到「主干」行 commit（跳过主干锁校验）")
    else:
        trunk = tm.group(1)
        if not main_short:
            rep.warn(skill_label, "versionlock-trunk",
                     "无法获取 main HEAD（git 不可用），跳过主干锁硬校验")
        elif trunk == main_short:
            rep.ok(skill_label, "versionlock-trunk",
                   f"主干锁 {trunk} == main HEAD ✓")
        elif any(mk in lock_text for mk in SNAPSHOT_MARKERS):
            rep.warn(skill_label, "versionlock-trunk",
                     f"主干锁 {trunk} != main HEAD {main_short}，"
                     f"version-lock.md 已标注为历史快照，建议刷新主干锁（非阻断）")
        else:
            rep.fatal(skill_label, "versionlock-trunk",
                      f"主干锁 {trunk} != main HEAD {main_short}，"
                      f"且未标注为历史快照（疑似版本锁过期）")

    if not any(f.severity == Severity.FATAL for f in rep.findings
               if f.skill == skill_label):
        rep.ok(skill_label, "versionlock", "版本锁一致性通过")


def _filter_by_scope(skills, scope: str):
    """按 scope 过滤（方案 Y）。meta/None/all 不过滤（全量）。"""
    if not scope or scope in ("all", "meta"):
        return skills
    if scope.startswith("dir/"):
        name = scope[len("dir/"):]
        return [s for s in skills if s.ftype == "dir" and s.dir_name == name]
    if scope.startswith("file/"):
        name = scope[len("file/"):]
        return [s for s in skills if s.ftype == "single" and s.name_field == name]
    return []


def run(rep: Report = None, scope: str = None) -> Report:
    rep = rep or Report("Tier6")
    skills = _filter_by_scope(discover_skills(), scope)
    if not skills:
        if scope and scope.startswith(("dir/", "file/")):
            rep.fatal("__repo__", "discovery",
                      f"scope {scope} 未匹配任何 Skill（清单与结构不一致？）")
        else:
            rep.info("__repo__", "discovery", "未发现任何 Skill")
        return rep

    main_short = git("rev-parse", "--short", "main")
    suffix = f"（scope={scope}）" if scope and scope != "all" else ""
    rep.info("__repo__", "discovery", f"发现 {len(skills)} 个 Skill{suffix}")

    any_lock = False
    for sk in skills:
        before = len(rep.findings)
        check_skill(sk, rep, main_short)
        if len(rep.findings) > before:
            any_lock = True
    if not any_lock:
        rep.info("__repo__", "versionlock",
                 "无技能含 version-lock.md，跳过 Tier6")
    return rep


if __name__ == "__main__":
    r = run()
    for f in r.findings:
        print(f"[{f.severity}] {f.skill}: {f.message}")
    sys.exit(1 if r.fatals else 0)
