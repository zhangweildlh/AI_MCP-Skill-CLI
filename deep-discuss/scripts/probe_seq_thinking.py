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
    print("   后、Phase 1 之前，必须按下列清单**实际调用** sequential-thinking 服务的真实入口")
    print("   （直接连接 Agent 或经任意聚合器中转，运行时探测确定，不硬编码 dynamic-mcp），以运行时结果判定服务可用性。")
    print()

    print("【必须真实执行的探测调用（两类拓扑皆可，运行时探测真实入口）】")
    emit_todo("1. 枚举全部可用 MCP 工具/服务（两类拓扑一视同仁）：直连工具 `mcp__<服务名>__process_thought` 与 任意聚合器分组内工具，不得假设特定聚合器名")
    emit_todo("2. 按能力特征匹配（记录+摘要+清空三件套）找到思维审计服务，记录真实接入途径（直连工具名 / 聚合器 group+name）")
    emit_todo("3. 用真实入口实测调用 process_thought（直连 `mcp__<服务名>__process_thought` / 聚合器 `call_dynamic_tool(group=<真实分组名>, name='process_thought')`）→ 判定 isError:false 即 available=true；**调用前先按「持久化感知」确定计数**：若服务有 list/get 计数能力则读计数 N，令 thought_number=N+1、total_thoughts=N+1（或更大安全值）；若无计数能力则用足够大安全值（如 999）；严禁写死 total_thoughts=1 后指望清洁态，避免 total_thoughts(1) < 自动递增的 thought_number 触发校验冲突")
    emit_todo("4. (可选清理) 优先仅移除探针自身思维（若服务支持按条删除/回滚）；仅当无单条删除能力且确认历史仅含探针污染（无真实用户思维）时，才用 clear_history 全量清空——clear_history 不可逆，切勿在有真实思维残留时调用")
    print()
    print("【失败判定】")
    emit_todo("返回 isError:true → **默认先按「持久化感知」修正 thought_number/total_thoughts 后重试一次**（不依赖错误文本分类即可救回最常见的持久化冲突）；重试 isError:false 仍判 available=true；重试仍失败才按错误类型判读：可用性失败(超时/接入途径异常/服务未运行/工具缺失/鉴权失败)→available=false 静默降级，参数契约不满足(schema/total_thoughts<thought_number/缺 stage)→视为接口不兼容 available=false")
    emit_todo("严禁仅凭「适配层文档存在」判定可用——这是 P3-03 错判根因；「调用报错」≠「服务不可用」；可用性判定不得依赖是否能从错误文本识别类型（彻底不依赖文本需服务端结构化错误，属服务端改造不在本范围）")
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
