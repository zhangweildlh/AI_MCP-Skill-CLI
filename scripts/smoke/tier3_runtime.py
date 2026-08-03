#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 3 · 运行冒烟（依赖 + 脚本 + 接口）。

  - 环境探测：确认 git / gh / uv / python / node 在 PATH（缺失仅 WARN，不阻断）
  - 脚本自检：
      * web-search / web-search/anysearch-skill：CLI ``--help`` 可正常执行（脚本存在却执行失败 = 致命）
      * web-search/tests：审计修复回归测试（unittest，失败 = 致命；缺依赖则 WARN）
      * tender-review-kit：自带 pytest 测试（pytest 已装却失败 = 致命；未装则跳过）
  - 接口探活（默认关闭）：设置环境变量 SMOKE_PROBE_API=1 后，用 .env 中的
    ANYSEARCH_API_KEY 对 API 端点做一次最小探活。关闭时仅 INFO 提示，避免 CI 网络抖动。
"""
from __future__ import annotations

import os
import re
import shutil
import sys
from pathlib import Path

from common import REPO_ROOT, Report, run_cmd

# E1 修复：失败必须三分类，不能只有「依赖缺失 / 其它」两档——
#   (a) 命令本身起不来（解释器未安装、不在 PATH）→ 环境缺失，跳过该 attempt，不作任何缺陷信号
#   (b) 第三方依赖缺失（ModuleNotFoundError / ImportError）→ 环境问题，降级 WARN
#   (c) 脚本自身真实报错（语法 / 逻辑 / 非零退出）→ 一律 FATAL，禁止被 (a)(b) 掩盖
# 此前 dep_error 是 sticky 标志：只要任一 attempt 缺依赖，后续 attempt 暴露的真实缺陷
# 也会被一并降级为 WARN，构成假阴性（漏报）。
_LAUNCH_FAIL_RE = re.compile(
    r"WinError\s*2\b|No such file or directory|command not found|"
    r"不是内部或外部命令|FileNotFoundError",
    re.I,
)
_DEP_ERR_RE = re.compile(r"ModuleNotFoundError|ImportError")
# unittest 输出中的异常类型名（行首形如 ``AssertionError: ...`` / ``ModuleNotFoundError: ...``）
_UNITTEST_EXC_RE = re.compile(r"^\s*([A-Za-z_][\w.]*(?:Error|Exception))\s*:", re.M)


def _launch_failed(code: int, text: str) -> bool:
    """命令是否「根本没跑起来」（可执行文件缺失 / 不在 PATH），而非脚本执行出错。"""
    return code in (-1, 127) or bool(_LAUNCH_FAIL_RE.search(text or ""))


def probe_tools(rep: Report) -> None:
    tools = {
        "git": ["git", "--version"],
        "gh": ["gh", "--version"],
        "uv": ["uv", "--version"],
        "python": ["python", "--version"],
        "python3": ["python3", "--version"],
        "node": ["node", "--version"],
    }
    for tool, cmd in tools.items():
        code, _, _ = run_cmd(cmd)
        if code == 0:
            rep.ok(tool, "env", f"{tool} 可用")
        else:
            rep.warn(tool, "env", f"{tool} 未在 PATH 找到（部分脚本依赖）")


def self_check(rep: Report) -> None:
    for skill, script in [
        ("web-search", "web-search/anysearch-skill/scripts/anysearch_cli.py"),
    ]:
        sp = REPO_ROOT / script
        if not sp.exists():
            rep.info(skill, "script", f"未找到 {script}，跳过")
            continue
        # uv 仅在存在时才作为兜底尝试；云端 CI 通常无 uv。
        # C12 修复：web-search/ 无 pyproject.toml，`uv run --project` 无法解析项目环境导致自检空转；
        # 改用 `uv run --with requests`，与父 SKILL.md 的调用契约保持一致。
        attempts = [
            ["python", script, "--help"],
            ["python3", script, "--help"],
        ]
        if shutil.which("uv"):
            attempts.append(["uv", "run", "--with", "requests",
                             "python", script, "--help"])
        ok = False
        dep_error = False
        real_error = False        # E1：脚本自身真实报错（非依赖、非启动失败）
        last_err = ""
        dep_err_text = ""
        real_err_text = ""
        for exe in attempts:
            code, out, err = run_cmd(exe)
            if code == 0:
                ok = True
                break
            combined_try = (out or "") + (err or "")
            last_err = err or out
            if _launch_failed(code, combined_try):
                # (a) 解释器/命令不可用：环境缺失，不作缺陷信号，继续尝试下一条回退路径
                continue
            if _DEP_ERR_RE.search(combined_try):
                dep_error = True                    # (b) 依赖缺失
                dep_err_text = combined_try
            else:
                real_error = True                   # (c) 真实缺陷
                real_err_text = combined_try
        if ok:
            rep.ok(skill, "script", f"{script} --help 通过")
        elif real_error:
            # E1：真实缺陷优先于依赖缺失判定，绝不降级
            rep.fatal(skill, "script",
                      f"{script} --help 执行失败（stderr: {real_err_text.strip()[:160]}）")
        elif dep_error:
            # 失败源于缺第三方依赖（如 requests），属环境问题，警告不阻断
            tail = dep_err_text.strip().splitlines()[-1][:120] if dep_err_text.strip() else ""
            rep.warn(skill, "script",
                     f"{script} 依赖未安装（{tail}），"
                     f"属环境依赖问题，未阻断；建议在运行环境安装依赖后重跑")
        else:
            rep.fatal(skill, "script",
                      f"{script} --help 执行失败（stderr: {last_err[:160]}）")

    # C7 修复：web-search 审计修复回归测试接入门禁（此前 tests/ 无任何 CI 触发，守护价值为零）
    ws_tests = REPO_ROOT / "web-search" / "tests"
    if ws_tests.exists():
        # 被测脚本模块级 import requests：uv 可用时优先 `uv run --with requests`，否则退回当前解释器
        # D10 修复：与上方脚本自检一致，采用 attempts 列表逐个回退（uv 优先、否则当前解释器），
        # 全部失败后再按错误分类判定，避免 uv 不可用场景直接 FATAL 阻断可用路径。
        attempts = [
            [sys.executable, "-m", "unittest", "discover", "-s", "web-search/tests", "-v"],
        ]
        if shutil.which("uv"):
            attempts.insert(0, ["uv", "run", "--with", "requests", "python",
                                "-m", "unittest", "discover", "-s", "web-search/tests", "-v"])
        code, out, err = 0, "", ""
        dep_error = False
        for cmd in attempts:
            code, out, err = run_cmd(cmd, timeout=300)
            if code == 0:
                break
            combined_try = (out or "") + (err or "")
            if _DEP_ERR_RE.search(combined_try):
                dep_error = True
        combined = (out or "") + (err or "")
        # D1 修复 + E1 精化：判据从「输出是否含 FAILED」升级为「是否出现非依赖类异常」。
        #   - 只含 ModuleNotFoundError / ImportError → 纯环境依赖问题 → WARN
        #   - 出现 AssertionError 等任何其它异常 → 真实回归 → FATAL（不得被依赖缺失掩盖）
        # 原判据用 "FAILED" 关键字过滤：缺 requests 时 unittest 汇总行本就是
        # `FAILED (errors=N)`，会把纯环境问题误判为致命（假阳性），故改为按异常类型判定。
        non_dep_exc = {
            name for name in _UNITTEST_EXC_RE.findall(combined)
        } - {"ModuleNotFoundError", "ImportError"}
        if code == 0:
            rep.ok("web-search", "tests", "审计修复回归测试通过（web-search/tests）")
        elif dep_error and not non_dep_exc:
            rep.warn("web-search", "tests",
                     "回归测试依赖未安装（requests），属环境问题未阻断；"
                     "建议 `uv run --with requests python -m unittest discover -s web-search/tests -v`")
        else:
            tail = combined.strip().splitlines()[-6:] if combined.strip() else []
            rep.fatal("web-search", "tests",
                      f"审计修复回归测试未通过：{' | '.join(t[:80] for t in tail)}")

    # tender-review-kit pytest
    trk = REPO_ROOT / "tender-review-kit"
    if (trk / "tests").exists():
        code, _, _ = run_cmd([sys.executable, "-m", "pytest", "--version"])
        if code != 0:
            rep.warn("tender-review-kit", "pytest", "pytest 未安装，跳过自带测试")
        else:
            code, out, err = run_cmd(
                [sys.executable, "-m", "pytest", "tender-review-kit/tests/", "-q"],
                timeout=300)
            if code == 0:
                rep.ok("tender-review-kit", "pytest", "自带测试通过")
            else:
                rep.fatal("tender-review-kit", "pytest",
                          f"pytest 未通过（stderr: {err[:160]}）")


def api_probe(rep: Report) -> None:
    if not os.environ.get("SMOKE_PROBE_API"):
        rep.info("__api__", "probe", "接口探活未启用（设置 SMOKE_PROBE_API=1 开启）")
        return
    envf = REPO_ROOT / "web-search/.env"
    key = ""
    if envf.exists():
        for line in envf.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("ANYSEARCH_API_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        rep.warn("__api__", "probe", "未找到 ANYSEARCH_API_KEY，跳过接口探活")
        return
    import json
    import urllib.request
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}).encode()
    req = urllib.request.Request(
        "https://api.anysearch.com/mcp", data=payload,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            rep.ok("__api__", "probe", f"接口探活 HTTP {r.status}")
    except Exception as e:  # noqa: BLE001
        rep.warn("__api__", "probe", f"接口探活失败：{e}")


def run(rep: Report = None) -> Report:
    rep = rep or Report("Tier3")
    probe_tools(rep)
    self_check(rep)
    api_probe(rep)
    return rep


if __name__ == "__main__":
    r = run()
    for f in r.findings:
        print(f"[{f.severity}] {f.skill}: {f.message}")
    sys.exit(1 if r.fatals else 0)
