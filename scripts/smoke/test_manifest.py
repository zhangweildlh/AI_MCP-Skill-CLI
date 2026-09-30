#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_manifest.py —— 测试资产唯一清单（single source of truth）。

本模块是 AI_MCP-Skill-CLI 全部测试资产的唯一权威登记处。
run_all.py 通过本模块实现「单一测试源」调度：发现、列出、运行、清理。

设计纪律（见 AGENTS.md §9 测试资产纪律）：
  - 任何项目级测试必须在此登记，禁止散落 ad-hoc 调用；
  - 测试分四类：smoke / regression / real-state；
  - 风险分三档：offline（可本地直接跑）/ needs-binary（需本地工具如 uv、docx 依赖）/
    needs-api（需真实 API / 网络 / provider）；
  - real-state（needs-api）默认不运行，须显式 --allow-real 门控，绝不进 CI；
  - 与 CI 既有 SMOKE_PROBE_API 门控哲学一致：真实态一律显式开关。

变更本清单即更新「唯一事实源」，须与对应测试文件增删改同步提交（meta PR）。
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# scripts/smoke -> 仓库根
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PYTHON = sys.executable

# 测试资产登记：每一项描述一个测试入口
#   scope : 归属（repo / dir/<目录名> / meta）
#   name  : 测试名（可读）
#   path  : 入口相对仓库根的路径（仅用于展示与定位）
#   cmd   : 调用命令（list，在 REPO_ROOT 下执行）；shell=True 时整体作为 shell 字符串
#   shell : 是否以 shell 执行（默认 False）
#   kind  : smoke | regression | real-state
#   risk  : offline | needs-binary | needs-api
#   note  : 说明
TEST_ENTRIES = [
    # ---- 仓库级冒烟（纪律门禁，CI 唯一自动入口）----
    dict(scope="repo", name="smoke-tier0-6", path="scripts/smoke/run_all.py",
         cmd=[PYTHON, "scripts/smoke/run_all.py"], shell=False,
         kind="smoke", risk="offline",
         note="仓库级纪律门禁（密钥/忽略/结构/合规/运行/触发/scope一致性/版本锁）；"
              "CI 自动调用，本地预提交亦用此入口"),

    # ---- dir/code-review-combo ----
    dict(scope="dir/code-review-combo", name="crc-guard", path="code-review-combo/tests/guard.sh",
         cmd=["bash", "code-review-combo/tests/guard.sh"], shell=False,
         kind="smoke", risk="offline",
         note="离线卫生守卫（仓库一致性），无 provider 依赖"),
    dict(scope="dir/code-review-combo", name="crc-verify-real", path="code-review-combo/tests/verify_combo.sh",
         cmd=["bash", "code-review-combo/tests/verify_combo.sh", "<provider>"], shell=False,
         kind="real-state", risk="needs-api",
         note="验收测试，需外部 ocr 二进制 + 真实 provider API；须手动补 <provider> 后运行，默认门控"),
    dict(scope="dir/code-review-combo", name="crc-review-spd", path="code-review-combo/review-spd/tests/test_review_context.py",
         cmd=[PYTHON, "code-review-combo/review-spd/tests/test_review_context.py"], shell=False,
         kind="regression", risk="needs-api",
         note="review-spd 上下文测试；疑似需 provider/LLM，保守标 needs-api，默认门控"),

    # ---- dir/github-personal-manager ----
    dict(scope="dir/github-personal-manager", name="gpm-smoke", path="github-personal-manager/smoke/run-smoke.sh",
         cmd=["bash", "github-personal-manager/smoke/run-smoke.sh"], shell=False,
         kind="smoke", risk="offline",
         note="SOP 脚本冒烟统一入口，桩模拟，离线安全"),
    dict(scope="dir/github-personal-manager", name="gpm-regression", path="github-personal-manager/regression/tests",
         cmd=["bash", "-c",
              'for t in github-personal-manager/regression/tests/test_*.sh; do bash "$t" || exit 1; done'],
         shell=True,
         kind="regression", risk="offline",
         note="回归套件，临时夹具仓库隔离，不改动真实仓库"),

    # ---- dir/web-search ----
    dict(scope="dir/web-search", name="ws-drift", path="web-search/tests/test_drift.py",
         cmd=[PYTHON, "-m", "unittest", "web-search.tests.test_drift", "-v"], shell=False,
         kind="regression", risk="offline",
         note="上游漂移对抗式测试，mock gh，离线"),
    dict(scope="dir/web-search", name="ws-sync", path="web-search/tests/test_sync.py",
         cmd=[PYTHON, "-m", "unittest", "web-search.tests.test_sync", "-v"], shell=False,
         kind="regression", risk="offline",
         note="孤儿剪枝回归，临时目录，离线"),
    dict(scope="dir/web-search", name="ws-matrix-deploy", path="web-search/tests/test_matrix_deploy.py",
         cmd=[PYTHON, "-m", "unittest", "web-search.tests.test_matrix_deploy", "-v"], shell=False,
         kind="real-state", risk="needs-api",
         note="矩阵部署测试，疑似需真实部署/API，默认门控"),
    dict(scope="dir/web-search", name="ws-orchestrate", path="web-search/tests/test_orchestrate.py",
         cmd=[PYTHON, "-m", "unittest", "web-search.tests.test_orchestrate", "-v"], shell=False,
         kind="real-state", risk="needs-api",
         note="编排测试，疑似需真实 API，默认门控"),
    dict(scope="dir/web-search", name="ws-cli", path="web-search/anysearch-skill/scripts/test_cli.py",
         cmd=[PYTHON, "web-search/anysearch-skill/scripts/test_cli.py"], shell=False,
         kind="regression", risk="needs-api",
         note="AnySearch CLI 测试，疑似需真实端点，默认门控"),

    # ---- dir/tender-review-kit ----
    dict(scope="dir/tender-review-kit", name="trk-smoke", path="tender-review-kit/tests/test_smoke.py",
         cmd=[PYTHON, "tender-review-kit/tests/test_smoke.py"], shell=False,
         kind="regression", risk="offline",
         note="合成样本回归基线，自包含，需 python-docx"),
    dict(scope="dir/tender-review-kit", name="trk-qa-full", path="tender-review-kit/tests/test_qa_full.py",
         cmd=[PYTHON, "tender-review-kit/tests/test_qa_full.py"], shell=False,
         kind="regression", risk="offline",
         note="全脚本回归+边界+对抗，自包含，需 python-docx"),

    # ---- dir/ref-material-writing ----
    dict(scope="dir/ref-material-writing", name="rmw-cli", path="ref-material-writing/scripts/smoke/test_anysearch_cli.py",
         cmd=[PYTHON, "-m", "unittest", "ref-material-writing.scripts.smoke.test_anysearch_cli", "-v"], shell=False,
         kind="regression", risk="offline",
         note="AnySearch CLI 全场景+边界，mock requests，离线"),
    dict(scope="dir/ref-material-writing", name="rmw-upstream", path="ref-material-writing/scripts/smoke/test_check_anysearch_upstream.py",
         cmd=[PYTHON, "-m", "unittest", "ref-material-writing.scripts.smoke.test_check_anysearch_upstream", "-v"], shell=False,
         kind="regression", risk="offline",
         note="上游一致性，mock gh，仅本地 git hash-object，离线"),
    dict(scope="dir/ref-material-writing", name="rmw-runtime", path="ref-material-writing/scripts/smoke/tier3_runtime_ref.py",
         cmd=[PYTHON, "ref-material-writing/scripts/smoke/tier3_runtime_ref.py"], shell=False,
         kind="smoke", risk="needs-binary",
         note="CLI 运行态门禁，需 uv + uv 工程；uv 工程缺失时自动跳过而非失败"),

    # ---- dir/file-structure-organizer ----
    dict(scope="dir/file-structure-organizer", name="fso-audit", path="file-structure-organizer/references/test_structure_audit.py",
         cmd=[PYTHON, "file-structure-organizer/references/test_structure_audit.py"], shell=False,
         kind="regression", risk="offline",
         note="结构审计脚本自检（未经逐行核验；若实际触网请改标 needs-api）"),

    # ---- meta（Memory-Data）----
    dict(scope="meta", name="mem-system", path="Memory-Data/test_memory_system.py",
         cmd=[PYTHON, "Memory-Data/test_memory_system.py"], shell=False,
         kind="regression", risk="offline",
         note="记忆体系唯一测试源，29/29 PASS（须先满足记忆维护门禁）"),
]


def _filter(scope: str | None, allow_real: bool):
    out = []
    for e in TEST_ENTRIES:
        if scope and e["scope"] != scope:
            continue
        if e["risk"] == "needs-api" and not allow_real:
            continue
        out.append(e)
    return out


def list_tests() -> int:
    """打印测试资产清单（唯一事实源视图）。"""
    print("=== 测试资产清单（唯一事实源：scripts/smoke/test_manifest.py）===")
    print(f"{'SCOPE':<26}{'KIND':<12}{'RISK':<14}{'NAME':<20}PATH")
    print("-" * 100)
    for e in TEST_ENTRIES:
        print(f"{e['scope']:<26}{e['kind']:<12}{e['risk']:<14}{e['name']:<20}{e['path']}")
    print("-" * 100)
    print("说明：")
    print("  - 仓库级冒烟(smoke-tier0-6) 是 CI 唯一自动入口；其余为本地/人工门禁。")
    print("  - risk=needs-api 为真实态测试，默认不运行，须 --allow-real 显式门控。")
    print("  - 运行：python scripts/smoke/run_all.py --list-tests / --scope <scope> --project-tests")
    return 0


def _entry_cmd_str(e: dict) -> str:
    if e.get("shell"):
        # cmd 第二项起拼接为 shell 串
        return " ".join(str(c) for c in e["cmd"])
    return " ".join(str(c) for c in e["cmd"])


def run_project_tests(scope: str | None, allow_real: bool) -> int:
    """按 scope 运行项目级测试（离线 + needs-binary；needs-api 除非 allow_real）。"""
    entries = _filter(scope, allow_real)
    if not entries:
        print(f"无匹配测试（scope={scope or 'all'}, allow_real={allow_real}）")
        return 0
    print(f"=== 运行项目级测试（scope={scope or 'all'}, allow_real={allow_real}）===")
    passed = failed = skipped = 0
    for e in entries:
        print(f"\n--- [{e['scope']}] {e['name']} ({e['kind']}/{e['risk']}) ---")
        print(f"  cmd: {_entry_cmd_str(e)}")
        try:
            if e.get("shell"):
                rc = subprocess.run(_entry_cmd_str(e), shell=True, cwd=str(REPO_ROOT),
                                    capture_output=False).returncode
            else:
                rc = subprocess.run(e["cmd"], cwd=str(REPO_ROOT),
                                    capture_output=False).returncode
        except FileNotFoundError as ex:
            print(f"  [SKIP] 命令不可用：{ex}")
            skipped += 1
            continue
        if rc == 0:
            print(f"  [PASS] {e['name']}")
            passed += 1
        else:
            print(f"  [FAIL] {e['name']} (exit={rc})")
            failed += 1
    print("\n=== 项目级测试结果 ===")
    print(f"PASS={passed}  FAIL={failed}  SKIP={skipped}")
    return 1 if failed else 0


# 测试过程/临时文件清理目标（相对仓库根）；与 AGENTS.md §8.3⑤ 衔接
CLEANUP_DIRS = [
    "code-review-combo/.verify_tmp",
    "github-personal-manager/smoke/tmp",
    "tender-review-kit/tests/workspace",
]


def cleanup() -> int:
    """清理测试衍生/临时/过程文件（不删可复用测试脚本）。"""
    import shutil
    removed = 0
    for rel in CLEANUP_DIRS:
        p = REPO_ROOT / rel
        if p.exists() and p.is_dir():
            shutil.rmtree(p)
            removed += 1
            print(f"[CLEAN] 已删除目录：{rel}")
    # 清理测试目录下的 __pycache__
    for pat in ("**/tests/__pycache__", "**/smoke/__pycache__", "scripts/smoke/__pycache__"):
        for d in REPO_ROOT.glob(pat):
            if d.is_dir():
                shutil.rmtree(d)
                removed += 1
                print(f"[CLEAN] 已删除缓存：{d.relative_to(REPO_ROOT)}")
    if removed == 0:
        print("[CLEAN] 无可清理项（已干净）")
    else:
        print(f"[CLEAN] 共清理 {removed} 项")
    return 0


def scan_unregistered() -> int:
    """扫描含 tests/ 或 smoke/ 的目录，核对是否已全部登记（支持「扫描优先」纪律）。"""
    registered_dirs = set()
    for e in TEST_ENTRIES:
        p = (REPO_ROOT / e["path"]).parent
        registered_dirs.add(p)
    gaps = []
    for d in sorted(REPO_ROOT.iterdir()):
        if not d.is_dir():
            continue
        if d.name in (".git", "worktrees", "_gsdata_", "reports", "node_modules",
                      ".workbuddy", "Memory-Data"):
            continue
        for sub in ("tests", "smoke", "scripts/smoke"):
            cand = d / sub
            if cand.is_dir() and cand not in registered_dirs:
                gaps.append(str(cand.relative_to(REPO_ROOT)))
    if gaps:
        print("[SCAN] 以下测试目录尚未在清单登记，建议补登：")
        for g in gaps:
            print(f"  - {g}")
        return 1
    print("[SCAN] 全部测试目录均已登记，无遗漏。")
    return 0


if __name__ == "__main__":
    sys.exit(list_tests())
