#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deep-discuss 思维审计层「激活探活器」（强制探测机制引导工具）

本脚本不调用任何 MCP 工具（Python 沙箱无 WorkBuddy MCP 客户端），
其作用是：在每次激活 deep-discuss 时由模型运行，输出**必须真实执行的
MCP 探测调用清单**、期望结果与失败判定，作为激活强制动作的 checklist。

同时做轻量自检：确认适配层文档与 selfcheck.py 已包含强制探活机制标记，
缺失则退出码 1（提醒维护者机制不完整）。

退出码：机制就绪且清单输出成功为 0；机制标记缺失为 1。
"""

import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
ADAPTER_DOC = SKILL_ROOT / "references" / "enhancements" / "sequential-thinking-adapter.md"
SELFCHECK = SKILL_ROOT / "scripts" / "selfcheck.py"

PROBE_MARKER = "强制探活"
SELFCHECK_MARKER = "probe_seq_thinking"  # selfcheck 第4项应检查本脚本

failures = []


def emit_ok(msg):
    print(f"  [OK]   {msg}")


def emit_fail(msg):
    print(f"  [FAIL] {msg}")
    failures.append(msg)


def emit_todo(msg):
    print(f"  [TODO] {msg}")


def main():
    print("=" * 64)
    print("deep-discuss · 思维审计层 激活探活器（强制探测 checklist）")
    print("=" * 64)
    print()
    print("⚠️ 本脚本仅输出清单，**不替代真实 MCP 调用**。激活 deep-discuss")
    print("   后、Phase 1 之前，必须按下列清单**实际调用** dynamic-mcp 暴露的")
    print("   工具，以运行时结果判定 sequential-thinking 服务可用性。")
    print()

    print("【必须真实执行的 MCP 调用】（group='sequential-thinking'）")
    emit_todo("1. call_dynamic_tool group='sequential-thinking' name='get_dynamic_tools'  → 列举工具，预期含 process_thought / generate_summary / clear_history")
    emit_todo("2. call_dynamic_tool group='sequential-thinking' name='process_thought' args={thought, stage, total_thoughts, next_thought_needed:false}  → 判定 isError:false 即 available=true")
    emit_todo("3. (可选清理) call_dynamic_tool group='sequential-thinking' name='clear_history'  → 清理探针思维")
    print()
    print("【失败判定】")
    emit_todo("返回 isError:true / 超时 / 聚合器未连接 → available=false，按 §3.4 静默降级")
    emit_todo("严禁仅凭「适配层文档存在」判定可用——这是 P3-03 错判根因")
    print()

    print("【机制自检：适配层文档与 selfcheck 是否已含强制探活标记】")
    if not ADAPTER_DOC.is_file():
        emit_fail(f"适配层文档缺失: {ADAPTER_DOC}")
    else:
        text = ADAPTER_DOC.read_text(encoding="utf-8")
        if PROBE_MARKER in text:
            emit_ok("适配层文档含「强制探活」标记（§3.5 协议存在）")
        else:
            emit_fail("适配层文档缺少「强制探活」标记，探测机制未闭环")

    if not SELFCHECK.is_file():
        emit_fail(f"selfcheck.py 缺失: {SELFCHECK}")
    else:
        text = SELFCHECK.read_text(encoding="utf-8")
        if SELFCHECK_MARKER in text:
            emit_ok("selfcheck.py 已纳入强制探活检查项")
        else:
            emit_fail("selfcheck.py 未检查本探活器，质量门禁未闭环")

    print()
    if failures:
        print(f"结论: 强制探活机制不完整，存在 {len(failures)} 项缺失。")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("结论: 强制探活机制就绪。激活 Skill 后请按上方 TODO 清单实际调用 MCP 工具。")
        sys.exit(0)


if __name__ == "__main__":
    main()
