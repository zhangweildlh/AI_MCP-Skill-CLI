#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deep-discuss 加载自检脚本（技能自带，随技能分发）

核对两项内容：
  1) 模块存在性：references/enhancements/ 下三个模块文件须存在且非空；
  2) 版本锁三链路一致性：
       链路① 模块首行 commit <-> version-lock.md 锁定表
       链路② 模块「更新记录」引用的 commit <-> 模块首行 commit
       链路③ 主干锁 commit <-> 当前仓库 main HEAD（或其已合入祖先）；
             非 git 仓库（如部署态副本）跳过本链路并提示。

退出码：全部通过（链路③ 可 SKIP）为 0；任一硬失败为 1。
"""

import re
import subprocess
import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
MODULE_DIR = SKILL_ROOT / "references" / "enhancements"
VERSION_LOCK = SKILL_ROOT / "version-lock.md"

MODULE_FILES = [
    "jasminK11-5why.md",
    "kimasplund-premortem.md",
    "silvereWolf-consult.md",
]

FIRST_LINE_RE = re.compile(r"<!--\s*版本锁定:\s*commit:(\S+)\s*-->")
UPDATE_REC_RE = re.compile(r"基于\s+\S+@(\S+)")
MAIN_LOCK_RE = re.compile(r"^\|\s*主干\s*\|\s*自身\s*\|\s*commit:(\S+)")

failures = []


def emit_ok(msg):
    print(f"  [OK]   {msg}")


def emit_fail(msg):
    print(f"  [FAIL] {msg}")
    failures.append(msg)


def emit_skip(msg):
    print(f"  [SKIP] {msg}")


def _git(args, cwd):
    """运行 git 命令；非 git 环境或任意异常返回 None。"""
    try:
        r = subprocess.run(
            ["git", *args], cwd=str(cwd),
            capture_output=True, text=True, timeout=15,
        )
        if r.returncode != 0:
            return None
        return r.stdout.strip()
    except Exception:
        return None


def main():
    print(f"deep-discuss 自检 · 技能根: {SKILL_ROOT}\n")

    # ---- 1) 模块存在性 ----
    print("1) 模块存在性（references/enhancements/ 下三文件）")
    if not MODULE_DIR.is_dir():
        emit_fail(f"模块目录不存在: {MODULE_DIR}")
    else:
        for fn in MODULE_FILES:
            p = MODULE_DIR / fn
            if not p.is_file():
                emit_fail(f"缺失模块文件: {fn}")
            elif p.stat().st_size == 0:
                emit_fail(f"模块文件为空: {fn}")
            else:
                emit_ok(f"{fn} 存在且非空")

    # ---- 2) 版本锁三链路 ----
    print("\n2) 版本锁三链路一致性")
    if not VERSION_LOCK.is_file():
        emit_fail(f"版本锁文件缺失: {VERSION_LOCK}")
        print("\n结论: 自检未通过，存在硬失败项。")
        sys.exit(1)

    lock_text = VERSION_LOCK.read_text(encoding="utf-8")

    # 解析主干锁
    main_lock = None
    for line in lock_text.splitlines():
        m = MAIN_LOCK_RE.match(line)
        if m:
            main_lock = m.group(1)
            break
    if main_lock:
        emit_ok(f"主干锁 commit = {main_lock}")
    else:
        emit_fail("未能从 version-lock.md 解析「主干」行的 commit")

    if MODULE_DIR.is_dir():
        for fn in MODULE_FILES:
            p = MODULE_DIR / fn
            if not p.is_file():
                continue
            text = p.read_text(encoding="utf-8")
            # 链路① 首行 commit
            first = FIRST_LINE_RE.search(text)
            if not first:
                emit_fail(f"{fn}: 首行未找到版本标记 `<!-- 版本锁定: commit:... -->`")
                continue
            first_commit = first.group(1)
            # 链路① 首行 commit 须出现在锁定表
            if first_commit in lock_text:
                emit_ok(f"{fn}: 首行 commit {first_commit[:10]}… 命中锁定表 (链路①)")
            else:
                emit_fail(f"{fn}: 首行 commit {first_commit} 未出现在 version-lock.md 锁定表 (链路①)")
            # 链路② 更新记录 commit 须与首行一致
            rec = UPDATE_REC_RE.search(text)
            if rec:
                rec_commit = rec.group(1)
                if rec_commit == first_commit:
                    emit_ok(f"{fn}: 更新记录 commit 与首行一致 (链路②)")
                else:
                    emit_fail(f"{fn}: 更新记录 commit={rec_commit} 与首行 commit={first_commit} 不一致 (链路②)")
            else:
                emit_ok(f"{fn}: 无「更新记录」commit 引用，链路② 跳过")

    # 链路③ 主干锁 <-> main HEAD（仅 git 仓库内可校验）
    if main_lock:
        main_head_short = _git(["rev-parse", "--short", "main"], SKILL_ROOT)
        if main_head_short is None:
            emit_skip("非 git 仓库，跳过主干锁<->main HEAD 比对（部署态副本常见）")
        elif main_lock == main_head_short:
            emit_ok(f"主干锁 {main_lock} == main HEAD {main_head_short} (链路③)")
        else:
            # 方案 A：主干锁为已合入 main 的祖先 -> 仍视为一致
            rc = _git(["merge-base", "--is-ancestor", main_lock, "main"], SKILL_ROOT)
            if rc is not None:  # 命令成功执行
                emit_ok(f"主干锁 {main_lock} 是 main HEAD {main_head_short} 的已合入祖先 (链路③, 方案A)")
            else:
                emit_fail(f"主干锁 {main_lock} 既不等于 main HEAD {main_head_short}，也非其祖先 (链路③)")

    # ---- 结论 ----
    print()
    if failures:
        print(f"结论: 自检未通过，存在 {len(failures)} 项硬失败。")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("结论: 自检全部通过（链路③ 在部署态可能 SKIP，属正常）。")
        sys.exit(0)


if __name__ == "__main__":
    main()
