#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 3 · 运行冒烟（依赖 + 脚本 + 接口）。

  - 环境探测：确认 git / gh / uv / python / node 在 PATH（缺失仅 WARN，不阻断）
  - 脚本自检：
      * anysearch-skill / web-search：CLI ``--help`` 可正常执行（脚本存在却执行失败 = 致命）
      * tender-review-kit：自带 pytest 测试（pytest 已装却失败 = 致命；未装则跳过）
  - 接口探活（默认关闭）：设置环境变量 SMOKE_PROBE_API=1 后，用 .env 中的
    ANYSEARCH_API_KEY 对 API 端点做一次最小探活。关闭时仅 INFO 提示，避免 CI 网络抖动。
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from common import REPO_ROOT, Report, run_cmd


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
        ("anysearch-skill", "anysearch-skill/scripts/anysearch_cli.py"),
        ("web-search", "web-search/scripts/anysearch_cli.py"),
    ]:
        sp = REPO_ROOT / script
        if not sp.exists():
            rep.info(skill, "script", f"未找到 {script}，跳过")
            continue
        # uv 仅在存在时才作为兜底尝试；云端 CI 通常无 uv
        attempts = [
            ["python", script, "--help"],
            ["python3", script, "--help"],
        ]
        if shutil.which("uv"):
            attempts.append(["uv", "run", "--project", str(REPO_ROOT / skill),
                            "python", script, "--help"])
        ok = False
        dep_error = False
        last_err = ""
        for exe in attempts:
            code, _, err = run_cmd(exe)
            if code == 0:
                ok = True
                break
            last_err = err
            if "ModuleNotFoundError" in err or "ImportError" in err:
                dep_error = True
        if ok:
            rep.ok(skill, "script", f"{script} --help 通过")
        elif dep_error:
            # 失败源于缺第三方依赖（如 requests），属环境问题，警告不阻断
            rep.warn(skill, "script",
                     f"{script} 依赖未安装（{last_err.strip().splitlines()[-1][:120]}），"
                     f"属环境依赖问题，未阻断；建议在运行环境安装依赖后重跑")
        else:
            rep.fatal(skill, "script",
                      f"{script} --help 执行失败（stderr: {last_err[:160]}）")

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
    envf = REPO_ROOT / "anysearch-skill/.env"
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
