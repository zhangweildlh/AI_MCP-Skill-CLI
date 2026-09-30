#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""记忆体系唯一测试源（覆盖矩阵 + 端到端真实态）。

本脚本是记忆体系测试的**唯一编排入口**，统一收敛四层测试，消除散落的临时
测试/报告，确立单一事实源：

  ① 单元层      ：memory-mgr.py 的 `selftest`（纯函数回归 33 项，零依赖、
                  不读写业务文件）—— 被本脚本编排调用，不重复实现。
  ② 链接/验收层 ：`verify`（一键跑完五项验收，第 2 项调用 `断链检测.py`）。
  ③ 端到端真实态：真实体系（`~/.workbuddy/MEMORY.md` + 本目录 `Memory-*.md`）
                  只读断言 `check` / `validate` / `verify` / `selftest` 退出 0。
  ④ 命令级集成  ：临时 `tempfile` 副本隔离，覆盖 F-1~F-4 修复点与常规子命令
                  （`index` / `remove` / `add` / `rewrite` / `route` / `next-num`
                  / `diff` / 版本号一致性），绝不触碰真实体系。

约定：
  - 真实体系主文件 = ~/.workbuddy/MEMORY.md；子目录 = 本脚本同目录（Memory-Data）。
  - 全局路径参数（--main-file / --sub-files-dir / --no-interactive）必须置于子命令之前。
  - 退出码：全 PASS → 0；任一 FAIL → 1。

用法（本机环境事实：uv 管 Python，禁裸 python）：
  uv run --project D:/Tools/Assembly/python/myenv python Memory-Data/test_memory_system.py
"""
import os
import re
import sys
import shutil
import subprocess
import tempfile
import hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
MEMORY_MGR = os.path.join(HERE, "memory-mgr.py")
MANUAL = os.path.join(HERE, "WorkBuddy记忆文件说明.md")
REAL_MAIN = os.path.expanduser("~/.workbuddy/MEMORY.md")
REAL_SUB = HERE

# 与本脚本同一解释器：用 `uv run --project myenv python test_memory_system.py` 启动时，
# sys.executable 即 myenv 的 python，调用 memory-mgr.py 复用同一环境（不硬编码路径）。
PY = sys.executable

# 覆盖矩阵登记：(层, 子命令, 场景, 体系, 是否通过, 细节)
CASES = []


def record(layer, cmd, scenario, scope, ok, detail=""):
    CASES.append((layer, cmd, scenario, scope, ok, detail))


def run_mgr(main, sub, *cmd, timeout=120):
    """统一调用 memory-mgr.py：全局路径参数必须置于子命令之前（argparse 子解析器顺序）。"""
    args = [PY, MEMORY_MGR, "--main-file", main, "--sub-files-dir", sub,
            "--no-interactive", *cmd]
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def build_tmp_system():
    """复制真实 Memory-*.md 到临时子目录，建最小空主文件。返回 (tmp_main, tmp_sub)。"""
    tmp_sub = tempfile.mkdtemp(prefix="mem_test_sub_")
    tmp_main_dir = tempfile.mkdtemp(prefix="mem_test_main_")
    tmp_main = os.path.join(tmp_main_dir, "MEMORY.md")
    open(tmp_main, "w", encoding="utf-8").write("")  # 空主文件，交给 index 生成
    for fn in os.listdir(HERE):
        if re.match(r"Memory-.*\.md$", fn, re.IGNORECASE):
            shutil.copy2(os.path.join(HERE, fn), os.path.join(tmp_sub, fn))
    return tmp_main, tmp_sub


def teardown_tmp(tmp_main, tmp_sub):
    shutil.rmtree(os.path.dirname(tmp_main), ignore_errors=True)
    shutil.rmtree(tmp_sub, ignore_errors=True)


def tool_version():
    txt = open(MEMORY_MGR, encoding="utf-8").read()
    m = re.search(r'__version__\s*=\s*"([^"]+)"', txt)
    return m.group(1) if m else None


def latest_manual_version():
    """从手册 §11（版本与维护记录，最新在上）提取最大版本号。"""
    txt = open(MANUAL, encoding="utf-8").read()
    idx = txt.find("## 11")
    region = txt[idx:] if idx >= 0 else txt
    vers = re.findall(r'v(\d+)\.(\d+)\.(\d+)', region)
    if not vers:
        return None
    best = max(vers, key=lambda t: (int(t[0]), int(t[1]), int(t[2])))
    return f"v{best[0]}.{best[1]}.{best[2]}"


def run():
    # ===== ① 单元层：selftest =====
    try:
        r = run_mgr(REAL_MAIN, REAL_SUB, "selftest")
        record("单元", "selftest", "纯函数回归 33 项", "真实体系(例外,不读业务)",
               r.returncode == 0, f"rc={r.returncode}")
    except Exception as e:  # noqa: BLE001
        record("单元", "selftest", "纯函数回归 33 项", "真实体系", False, repr(e))

    # ===== ② 链接/验收层：verify（真实体系） =====
    try:
        r = run_mgr(REAL_MAIN, REAL_SUB, "verify")
        record("链接/验收", "verify", "五项验收一键化(含断链检测)", "真实体系",
               r.returncode == 0, f"rc={r.returncode}")
    except Exception as e:  # noqa: BLE001
        record("链接/验收", "verify", "五项验收一键化(含断链检测)", "真实体系", False, repr(e))

    # ===== ③ 端到端真实态层（只读） =====
    for cmd in ("check", "validate"):
        try:
            r = run_mgr(REAL_MAIN, REAL_SUB, cmd)
            record("端到端真实态", cmd, "只读结构/纪律校验", "真实体系",
                   r.returncode == 0, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("端到端真实态", cmd, "只读结构/纪律校验", "真实体系", False, repr(e))

    # ===== ④ 命令级集成层（临时隔离副本） =====
    tmp_main, tmp_sub = build_tmp_system()
    victim = next((f for f in os.listdir(tmp_sub)
                   if re.match(r"Memory-.*\.md$", f, re.IGNORECASE)), None)
    try:
        # F-4 index 零 churn 幂等（连续两次 index，内容须一致）
        try:
            r1 = run_mgr(tmp_main, tmp_sub, "index")
            h1 = md5(tmp_main)
            r2 = run_mgr(tmp_main, tmp_sub, "index")
            h2 = md5(tmp_main)
            ok = r1.returncode == 0 and r2.returncode == 0 and h1 == h2
            record("命令级集成", "index", "F-4 零 churn 幂等(连续两次内容一致)", "临时隔离",
                   ok, f"rc1={r1.returncode} rc2={r2.returncode} churn={'有' if h1 != h2 else '零'}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "index", "F-4 零 churn 幂等", "临时隔离", False, repr(e))

        # add 预览（dry-run，不写盘）
        try:
            r = run_mgr(tmp_main, tmp_sub, "add", "--topic", "测试主题",
                        "--content", "测试正文", "--dry-run")
            record("命令级集成", "add", "预览(dry-run,不写盘)", "临时隔离",
                   r.returncode == 0, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "add", "预览(dry-run,不写盘)", "临时隔离", False, repr(e))

        # rewrite 预览（dry-run，只读）
        if victim:
            try:
                r = run_mgr(tmp_main, tmp_sub, "rewrite", "--file", victim, "--dry-run")
                record("命令级集成", "rewrite", "预览(dry-run)", "临时隔离",
                       r.returncode == 0, f"rc={r.returncode}")
            except Exception as e:  # noqa: BLE001
                record("命令级集成", "rewrite", "预览(dry-run)", "临时隔离", False, repr(e))

        # route 只读（读前精判）
        try:
            r = run_mgr(tmp_main, tmp_sub, "route", "--query", "git 提交规范")
            record("命令级集成", "route", "读前精判(只读)", "临时隔离",
                   r.returncode == 0, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "route", "读前精判(只读)", "临时隔离", False, repr(e))

        # next-num 只读（增量编号判定）
        if victim:
            try:
                r = run_mgr(tmp_main, tmp_sub, "next-num", "--file", victim)
                record("命令级集成", "next-num", "增量编号(只读)", "临时隔离",
                       r.returncode == 0, f"rc={r.returncode}")
            except Exception as e:  # noqa: BLE001
                record("命令级集成", "next-num", "增量编号(只读)", "临时隔离", False, repr(e))

        # F-2 remove 双判据（一）：dry-run 预览，应退出 0 且不删文件
        if victim:
            try:
                r = run_mgr(tmp_main, tmp_sub, "remove", "--file", victim,
                            "--dry-run")
                still_there = os.path.exists(os.path.join(tmp_sub, victim))
                ok = r.returncode == 0 and still_there
                record("命令级集成", "remove", "F-2 dry-run 预览(非交互,不删)", "临时隔离",
                       ok, f"rc={r.returncode} 仍存在={still_there}")
            except Exception as e:  # noqa: BLE001
                record("命令级集成", "remove", "F-2 dry-run 预览", "临时隔离", False, repr(e))

        # F-2 remove 双判据（二）：非交互无 --force —— 核心是绝不弹 input、绝不 EOFError。
        # 无论 victim 是否被引用（有引用→ERROR 退出 1；无引用→直接删退出 0），
        # 修复后都不得出现 EOFError（修复前非交互缺 --force 必崩 EOFError）。
        if victim:
            try:
                r = run_mgr(tmp_main, tmp_sub, "remove", "--file", victim)
                combined = r.stdout + r.stderr
                ok = (r.returncode in (0, 1)) and ("EOFError" not in combined)
                record("命令级集成", "remove",
                       "F-2 非交互无--force(绝不 EOFError)", "临时隔离",
                       ok, f"rc={r.returncode} EOFError={'有' if 'EOFError' in combined else '无'}")
            except Exception as e:  # noqa: BLE001
                record("命令级集成", "remove", "F-2 非交互无--force", "临时隔离", False, repr(e))
    finally:
        teardown_tmp(tmp_main, tmp_sub)

    # F-1 diff 时区（需真实 changelog 的 UTC 条目，用真实体系只读）
    try:
        r = run_mgr(REAL_MAIN, REAL_SUB, "diff", "--before", "2026-09-25",
                    "--after", "2026-09-30")
        record("命令级集成", "diff", "F-1 时区对比(日期范围,无 TypeError 崩溃)",
               "真实体系(只读)", r.returncode == 0, f"rc={r.returncode}")
    except Exception as e:  # noqa: BLE001
        record("命令级集成", "diff", "F-1 时区对比", "真实体系", False, repr(e))

    # F-3 版本号单一事源（__version__ == 手册 §11 最新版本）
    try:
        tv = tool_version()
        mv = latest_manual_version()
        ok = (tv is not None) and (tv == mv)
        record("命令级集成", "版本号", "F-3 __version__ == 手册§11 最新版本",
               "源码+手册", ok, f"tool={tv} manual={mv}")
    except Exception as e:  # noqa: BLE001
        record("命令级集成", "版本号", "F-3 版本号一致性", "源码+手册", False, repr(e))

    # ===== 输出全场景覆盖矩阵 =====
    print("\n" + "=" * 80)
    print("记忆体系唯一测试源 — 全场景覆盖矩阵")
    print("=" * 80)
    print(f"{'层':<14}{'子命令':<13}{'场景':<32}{'体系':<14}{'结果'}")
    print("-" * 80)
    passed = failed = 0
    for layer, cmd, scenario, scope, ok, detail in CASES:
        mark = "PASS" if ok else "FAIL"
        print(f"{layer:<14}{cmd:<13}{scenario:<32}{scope:<14}{mark}")
        if detail:
            print(f"{'':<14}{'':<13}{'细节':<32}{detail}")
        if ok:
            passed += 1
        else:
            failed += 1
    print("-" * 80)
    print(f"[{'OK' if failed == 0 else 'FAIL'}] {passed}/{passed + failed} 通过")
    print("=" * 80)
    return failed == 0


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
