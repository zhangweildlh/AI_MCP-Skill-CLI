#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_mimo_mcp_smoke.py — mimo_mcp.py v2.2.0 离线冒烟测试

校验 mimo_mcp.py 的关键契约（无需联网、无需 API Key）：
  - 模块可正常导入（即语法/字节码校验通过）
  - 版本号 == "2.2.0"
  - get_code_timeout() 默认 == 900
  - MimoMCPServer 可离线实例化
  - _metrics_tool 返回结构化统计，初始 calls == 0
  - _mimo_code 缺 prompt 时返回 isError 且 metrics 分类计数正确
    （calls == errors == 1，calls == success+failed+timeouts+errors 守恒）
  - handle_tools_list 注册了 mimo.metrics 工具

直接 `uv run python test_mimo_mcp_smoke.py` 或 `python test_mimo_mcp_smoke.py` 跑，无 pytest 依赖。
"""
import os
import sys
import json

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# 保证能 import 同目录的 mimo_mcp（无论从哪里运行）
ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import mimo_mcp as M


def red(s):
    return "\033[31m" + s + "\033[0m"


def green(s):
    return "\033[32m" + s + "\033[0m"


def check(name, cond, extra=""):
    if cond:
        print(green("✓"), name, extra)
        return True
    print(red("✗"), name, extra)
    return False


def main():
    errors = []

    # 1. 版本契约
    if not check("VERSION==2.2.0", M.MimoMCPServer.VERSION == "2.2.0",
                 "(实际 %s)" % M.MimoMCPServer.VERSION):
        errors.append("VERSION 不符")
    if not check("get_code_timeout()==900", M.get_code_timeout() == 900,
                 "(实际 %s)" % M.get_code_timeout()):
        errors.append("默认超时不符")

    # 2. 离线实例化
    try:
        s = M.MimoMCPServer()
        print(green("✓"), "MimoMCPServer 离线实例化成功")
    except Exception as e:
        errors.append("实例化失败: %s" % e)
        print(red("✗"), "MimoMCPServer 离线实例化失败:", e)
        s = None

    if s is not None:
        # 3. metrics 初始态
        m0 = s._metrics
        if not check("metrics 初始 calls==0", m0["calls"] == 0,
                     "(%s)" % json.dumps(
                         {k: m0[k] for k in ("calls", "success", "failed",
                                            "timeouts", "errors")})):
            errors.append("metrics 初始态异常")

        # 4. _mimo_code 缺 prompt 走参数校验分支
        r = s._mimo_code({})
        is_err = bool(r.get("isError"))
        if not check("_mimo_code({}) 返回 isError", is_err):
            errors.append("缺 prompt 未返回 isError")

        # 5. 分类计数守恒：calls == success+failed+timeouts+errors
        m = s._metrics
        total = m["success"] + m["failed"] + m["timeouts"] + m["errors"]
        if not check("calls==分类计数和", m["calls"] == total,
                     "(calls=%d, 分类和=%d)" % (m["calls"], total)):
            errors.append("分类计数不守恒")
        if not check("errors==1 (缺 prompt)", m["errors"] == 1,
                     "(errors=%d)" % m["errors"]):
            errors.append("errors 计数异常")
        if not check("calls==1", m["calls"] == 1,
                     "(calls=%d)" % m["calls"]):
            errors.append("calls 计数异常")

        # 6. mimo.metrics 工具已注册
        tools = [t["name"] for t in s.handle_tools_list({})["tools"]]
        if not check("tools/list 含 mimo.metrics", "mimo.metrics" in tools,
                     "(%s)" % tools):
            errors.append("mimo.metrics 未注册")

        # 7. _metrics_tool 返回结构化统计
        stat = s._metrics_tool({})
        text = stat["content"][0]["text"]
        try:
            payload = json.loads(text)
            keys_ok = all(k in payload for k in
                          ("calls", "success", "failed", "timeouts", "errors",
                           "total_ms", "max_ms", "version", "mimo_exe"))
            if not check("_metrics_tool 结构化字段完整", keys_ok,
                         "(%s)" % sorted(payload.keys())):
                errors.append("_metrics_tool 字段缺失")
        except Exception as e:
            errors.append("_metrics_tool 非合法 JSON: %s" % e)
            print(red("✗"), "_metrics_tool 返回非 JSON:", e)

    print()
    if errors:
        print(red("✗ 冒烟失败 %d 项:" % len(errors)))
        for e in errors:
            print("  ", e)
        sys.exit(1)
    print(green("✓ mimo_mcp.py v2.2.0 离线冒烟全部通过"))


if __name__ == "__main__":
    main()
