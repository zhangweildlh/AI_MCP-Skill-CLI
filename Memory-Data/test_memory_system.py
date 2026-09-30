#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""记忆体系唯一测试源（覆盖矩阵 + 端到端真实态）。

本脚本是记忆体系测试的**唯一编排入口**，统一收敛四层测试，消除散落的临时
测试/报告，确立单一事实源：

  ① 单元层      ：memory-mgr.py 的 `selftest`（纯函数回归 33 项，零依赖、
                  不读写业务文件）—— 被本脚本编排调用，不重复实现。
  ② 链接/验收层 ：`verify`（一键跑完五项验收，第 2 项调用 `断链检测.py`）；
                  另独立调用 `断链检测.py` 对 P-1~P-4 四分支做交叉验证。
  ③ 端到端真实态：真实体系（`~/.workbuddy/MEMORY.md` + 本目录 `Memory-*.md`）
                  只读断言 `check` / `validate` / `verify` / `selftest` / `changelog`
                  退出 0；权威结论唯一，不与 `断链检测.py` 冲突。
  ④ 命令级集成  ：临时 `tempfile` 副本隔离，覆盖全部 13 个子命令与边界：
                  `selftest`(指针①) / `verify`(指针②) / `check` / `validate`
                  / `index` / `add`(dry-run+真实写) / `rewrite`(dry-run+真实写)
                  / `remove`(dry-run+非交互守卫+白名单拒绝+路径穿越拒绝)
                  / `route` / `next-num` / `get-offset`(有效+章节缺失+文件缺失)
                  / `number --init`(dry-run) / `sync` / `restore`(无--force守卫)
                  / `changelog` / `diff` / 版本号一致性 / `resolve_paths` 启动期
                  退出码 2 守卫；绝不触碰真实体系。

边界覆盖（全边界）：
  · 启动期路径校验：`--main-file` 不存在 / `--sub-files-dir` 不存在 → 退出码 2 中止。
  · `get-offset`  ：章节不存在 / 文件不存在 → 友好报错，不崩溃。
  · `remove`      ：白名单拒绝工具脚本/手册；`..` 路径穿越被 `_safe_filename` 拦截。
  · `number`      ：未带 `--init` 守卫 → 退出码 2。
  · `restore`     ：无 `--force` 守卫 → 不执行任何破坏性动作（文件保持不变）。
  · `断链检测.py` ：注入临时子文件，独立验证 P-1 越界引用 / P-2 缺回链 /
                   P-3 无锚点链接 / P-4 锚点重复 四分支真实触发。

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
BROKEN = os.path.join(HERE, "断链检测.py")
MANUAL = os.path.join(HERE, "WorkBuddy记忆文件说明.md")
REAL_MAIN = os.path.expanduser("~/.workbuddy/MEMORY.md")
REAL_SUB = HERE

# 与本脚本同一解释器：用 `uv run --project myenv python test_memory_system.py` 启动时，
# sys.executable 即 myenv 的 python，调用 memory-mgr.py / 断链检测.py 复用同一环境。
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


def run_broken(main, sub, *cmd, timeout=120):
    """统一调用断链检测.py（全局路径参数置于子命令之前）。"""
    args = [PY, BROKEN, "--main-file", main, "--sub-files-dir", sub, *cmd]
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


def build_broken_system():
    """构造含越界引用/缺回链/无锚点/锚点重复四类缺陷的临时体系，供断链检测四分支验证。

    返回 (tmp_main, tmp_sub)；其中 Memory-A.md 同时触发 P-1(c→Outside.md)
    / P-2(无 MEMORY.md 回链) / P-3(无锚点链接 c→Memory-B.md) / P-4(重复标题锚点)，
    Memory-B.md 含对主文件的回链（仅用于对照，证明 P-2 不误报）。
    """
    tmp_sub = tempfile.mkdtemp(prefix="mem_broken_sub_")
    tmp_main_dir = tempfile.mkdtemp(prefix="mem_broken_main_")
    tmp_main = os.path.join(tmp_main_dir, "MEMORY.md")
    # 主文件指向一个真实存在的锚点，避免自身产生断链噪声
    open(tmp_main, "w", encoding="utf-8").write(
        "# 主记忆\n\n[指向A](Memory-A.md#1-标题甲)\n")
    a = (
        "---\ntitle: A\ntags: [x]\nrelated: []\nscope_in: 测试\nscope_out: 其他\n---\n"
        "## 1 标题甲\n\n正文\n\n"
        "[越界](Outside.md#y)\n\n"          # P-1 越界引用（Outside.md 不在白名单）
        "[无锚点](Memory-B.md)\n\n"          # P-3 无锚点链接（指向 Memory-B.md）
        "## 重复标题\n\n内容一\n\n"            # P-4 锚点重复（与下一条同锚点）
        "## 重复标题\n\n内容二\n"             # P-4 锚点重复
    )
    b = (
        "---\ntitle: B\ntags: [x]\nrelated: []\nscope_in: 测试\nscope_out: 其他\n---\n"
        "## 1 标题乙\n\n正文\n\n[回链](MEMORY.md)\n"   # 含主文件回链（P-2 对照，不误报）
    )
    open(os.path.join(tmp_sub, "Memory-A.md"), "w", encoding="utf-8").write(a)
    open(os.path.join(tmp_sub, "Memory-B.md"), "w", encoding="utf-8").write(b)
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
    for cmd in ("check", "validate", "changelog"):
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

        # add 真实写入（覆盖 add 写盘分支：新建文件 + rewrite + 自动 check）
        try:
            before = len([f for f in os.listdir(tmp_sub)
                          if re.match(r"Memory-.*\.md$", f, re.IGNORECASE)])
            r = run_mgr(tmp_main, tmp_sub, "add", "--topic", "集成测试新增",
                        "--content", "新增正文")
            after = len([f for f in os.listdir(tmp_sub)
                         if re.match(r"Memory-.*\.md$", f, re.IGNORECASE)])
            ok = r.returncode == 0 and after > before
            record("命令级集成", "add", "真实写入(新建子文件+rewrite+check)", "临时隔离",
                   ok, f"rc={r.returncode} 文件数 {before}→{after}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "add", "真实写入", "临时隔离", False, repr(e))

        # rewrite 预览（dry-run，只读）
        if victim:
            try:
                r = run_mgr(tmp_main, tmp_sub, "rewrite", "--file", victim, "--dry-run")
                record("命令级集成", "rewrite", "预览(dry-run)", "临时隔离",
                       r.returncode == 0, f"rc={r.returncode}")
            except Exception as e:  # noqa: BLE001
                record("命令级集成", "rewrite", "预览(dry-run)", "临时隔离", False, repr(e))

        # rewrite 真实写入（覆盖 rewrite 写盘分支：重建 N-M-X-Z 编号）
        if victim:
            try:
                r = run_mgr(tmp_main, tmp_sub, "rewrite", "--file", victim)
                record("命令级集成", "rewrite", "真实写入(重编号+重建索引)", "临时隔离",
                       r.returncode == 0, f"rc={r.returncode}")
            except Exception as e:  # noqa: BLE001
                record("命令级集成", "rewrite", "真实写入", "临时隔离", False, repr(e))

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

        # get-offset：构造已知章节的临时子文件，验证有效章节返回行号范围（JSON）
        offset_file = "Memory-OffsetTest.md"
        offset_path = os.path.join(tmp_sub, offset_file)
        open(offset_path, "w", encoding="utf-8").write(
            "---\ntitle: 偏移测试\ntags: [x]\nrelated: []\nscope_in: 测试\nscope_out: 其他\n---\n"
            "## 1 测试章\n\n第一段\n\n第二段\n")
        try:
            r = run_mgr(tmp_main, tmp_sub, "get-offset", "--file", offset_file,
                        "--section", "## 1", "--json")
            ok = r.returncode == 0 and '"start_line"' in r.stdout
            record("命令级集成", "get-offset", "有效章节返回行号范围(JSON)", "临时隔离",
                   ok, f"rc={r.returncode} 含start_line={'start_line' in r.stdout}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "get-offset", "有效章节", "临时隔离", False, repr(e))

        # get-offset 边界：章节不存在 → 友好报错，不崩溃
        try:
            r = run_mgr(tmp_main, tmp_sub, "get-offset", "--file", offset_file,
                        "--section", "## 99 不存在")
            ok = r.returncode == 0 and "未找到章节" in (r.stdout + r.stderr)
            record("命令级集成", "get-offset", "边界:章节不存在(友好报错)", "临时隔离",
                   ok, f"rc={r.returncode} 未找到章节={'未找到章节' in (r.stdout + r.stderr)}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "get-offset", "边界:章节不存在", "临时隔离", False, repr(e))

        # get-offset 边界：文件不存在 → 友好报错，不崩溃
        try:
            r = run_mgr(tmp_main, tmp_sub, "get-offset", "--file", "Memory-NoSuch.md",
                        "--section", "## 1")
            ok = r.returncode == 0 and "文件不存在" in (r.stdout + r.stderr)
            record("命令级集成", "get-offset", "边界:文件不存在(友好报错)", "临时隔离",
                   ok, f"rc={r.returncode} 文件不存在={'文件不存在' in (r.stdout + r.stderr)}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "get-offset", "边界:文件不存在", "临时隔离", False, repr(e))

        # number --init --dry-run（覆盖 number_init 全路径：解析+排序+方案，不写盘）
        try:
            r = run_mgr(tmp_main, tmp_sub, "number", "--init", "--dry-run")
            record("命令级集成", "number", "init 预览(dry-run,不写盘)", "临时隔离",
                   r.returncode == 0, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "number", "init 预览", "临时隔离", False, repr(e))

        # number 守卫：未带 --init → 退出码 2（一次性迁移命令，禁止误用）
        try:
            r = run_mgr(tmp_main, tmp_sub, "number")
            record("命令级集成", "number", "边界:未带--init(守卫,rc=2)", "临时隔离",
                   r.returncode == 2, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "number", "边界:未带--init", "临时隔离", False, repr(e))

        # sync（覆盖 sync 全路径：扫描+状态对比+索引重建，临时隔离不染真实体系）
        try:
            r = run_mgr(tmp_main, tmp_sub, "sync")
            record("命令级集成", "sync", "同步状态文件+索引重建", "临时隔离",
                   r.returncode == 0, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "sync", "同步状态文件", "临时隔离", False, repr(e))

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

        # remove 白名单边界：拒绝删除工具脚本（路径遍历防护，不实际删除）
        try:
            r = run_mgr(tmp_main, tmp_sub, "remove", "--file", "memory-mgr.py")
            ok = r.returncode == 1
            record("命令级集成", "remove", "边界:白名单拒绝工具脚本(rc=1)", "临时隔离",
                   ok, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "remove", "边界:白名单拒绝", "临时隔离", False, repr(e))

        # remove 路径穿越边界：`..` 被 `_safe_filename` 拦截（rc=1，不删除任何文件）
        try:
            r = run_mgr(tmp_main, tmp_sub, "remove", "--file", "../secret.md")
            ok = r.returncode == 1
            record("命令级集成", "remove", "边界:路径穿越被拦截(rc=1)", "临时隔离",
                   ok, f"rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            record("命令级集成", "remove", "边界:路径穿越被拦截", "临时隔离", False, repr(e))

        # restore 守卫：无 --force → 不执行任何破坏性动作（文件保持不变，rc=1）
        if victim:
            try:
                vpath = os.path.join(tmp_sub, victim)
                before = md5(vpath)
                r = run_mgr(tmp_main, tmp_sub, "restore", "--file", victim,
                            "--commit", "deadbeef")
                after = md5(vpath) if os.path.exists(vpath) else None
                ok = (r.returncode == 1) and (after == before) and os.path.exists(vpath)
                record("命令级集成", "restore", "边界:无--force(不破坏性回滚,文件不变)", "临时隔离",
                       ok, f"rc={r.returncode} 未变={after == before}")
            except Exception as e:  # noqa: BLE001
                record("命令级集成", "restore", "边界:无--force", "临时隔离", False, repr(e))
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

    # ===== 边界：resolve_paths 启动期路径校验（退出码 2 中止，不执行任何命令）=====
    try:
        r = run_mgr(os.path.join(tempfile.mkdtemp(), "NOPE.md"), REAL_SUB, "check")
        record("边界", "resolve_paths", "主文件不存在→rc=2 中止", "隔离(坏主文件)",
               r.returncode == 2, f"rc={r.returncode}")
    except Exception as e:  # noqa: BLE001
        record("边界", "resolve_paths", "主文件不存在", "隔离", False, repr(e))

    try:
        r = run_mgr(REAL_MAIN, os.path.join(tempfile.mkdtemp(), "NOPE_DIR"), "check")
        record("边界", "resolve_paths", "子目录不存在→rc=2 中止", "隔离(坏子目录)",
               r.returncode == 2, f"rc={r.returncode}")
    except Exception as e:  # noqa: BLE001
        record("边界", "resolve_paths", "子目录不存在", "隔离", False, repr(e))

    # ===== 断链检测.py P-1~P-4 四分支独立验证（注入临时缺陷体系）=====
    b_main, b_sub = build_broken_system()
    try:
        r = run_broken(b_main, b_sub)
        out = r.stdout + r.stderr
        p1 = ("越界引用" in out) and ("Outside.md" in out)
        p2 = ("缺少指向主文件的回链" in out) and ("Memory-A.md" in out)
        p3 = ("无锚点链接" in out) and ("Memory-B.md" in out)
        p4 = ("锚点重复" in out) and ("重复标题" in out)
        ok = r.returncode == 0 and p1 and p2 and p3 and p4
        detail = (f"rc={r.returncode} P1越界={p1} P2缺回链={p2} "
                  f"P3无锚点={p3} P4锚点重复={p4}")
        record("断链检测", "P-1~P-4", "四分支独立验证(越界/缺回链/无锚点/重复)", "隔离(注入缺陷)",
               ok, detail)
    except Exception as e:  # noqa: BLE001
        record("断链检测", "P-1~P-4", "四分支独立验证", "隔离", False, repr(e))
    finally:
        teardown_tmp(b_main, b_sub)

    # ===== 输出全场景覆盖矩阵 =====
    print("\n" + "=" * 80)
    print("记忆体系唯一测试源 — 全场景覆盖矩阵")
    print("=" * 80)
    print(f"{'层':<14}{'子命令':<13}{'场景':<30}{'体系':<16}{'结果'}")
    print("-" * 80)
    passed = failed = 0
    for layer, cmd, scenario, scope, ok, detail in CASES:
        mark = "PASS" if ok else "FAIL"
        print(f"{layer:<14}{cmd:<13}{scenario:<30}{scope:<16}{mark}")
        if detail:
            print(f"{'':<14}{'':<13}{'细节':<30}{detail}")
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
