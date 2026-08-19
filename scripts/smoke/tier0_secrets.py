#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 0 · 入库前门禁（防泄密 + 防误提交）。

两项检查：
  1. 密钥扫描：对（暂存或已跟踪）文件扫描高危密钥模式，命中即致命阻断。
  2. .gitignore 策略校验：确保敏感目录被忽略、按策略应入库的文件未被忽略。

关于 ANYSEARCH_API_KEY：
  ref-material-writing/.env 中的真实 ANYSEARCH_API_KEY 按用户明确决策（#10 / D-2026-0811-01）已授权入库，
  故列入 ALLOW_PATTERNS + 路径级豁免（EXEMPT_SCAN_PATHS），扫描命中不报致命。
  web-search/.env 中的同类真实密钥已于 2026-08-11 改判为「绝不入库」（密钥已落历史、
  须轮换作废，见 .gitignore），故从 MUST_TRACK 移除并归入 MUST_IGNORE，与 .gitignore 一致。
  若日后希望收紧 ref-material-writing，移除 EXEMPT_SCAN_PATHS 与 ALLOW_PATTERNS 中对应条目即可。

可见性守卫（方案 Y）：
  所有路径级豁免（EXEMPT_SCAN_PATHS）仅当仓库为 private 时生效（_repo_is_private）；
  CI 通过环境变量 github.repository_visibility 判定（smoke.yml 显式透传），
  本地默认按 private 放行。仓库若转为 public，豁免自动失效、密钥文件恢复扫描阻断。
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from common import REPO_ROOT, Report, Severity, is_ignored, staged_files, tracked_files

# ---- 致命密钥模式（命中即阻断）----
DENY_PATTERNS = [
    ("CODEBUDDY_GATEWAY_PASSWORD", re.compile(r"CODEBUDDY_GATEWAY_PASSWORD\s*=\s*\S+")),
    ("OpenAI sk- key", re.compile(r"sk-[A-Za-z0-9]{20,}")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b")),
    ("GitHub PAT", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("Private key block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")),
    ("Slack token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("Generic password", re.compile(r"(?:password|passwd|pwd)\s*[:=]\s*[\"']?([^\s\"']{8,})")),
    ("Bearer token", re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}")),
    ("Long token assignment", re.compile(r"\btoken\s*[:=]\s*[\"']?([A-Za-z0-9._-]{20,})")),
]

# ---- 允许清单（命中则不报致命）----
ALLOW_PATTERNS = [
    re.compile(r"ANYSEARCH_API_KEY\s*="),           # 用户授权入库的真实 Key
    re.compile(r"你的API Key"),
    re.compile(r"(your[-_ ]?api[-_ ]?key|example|xxxx|占位|示例|changeme|REPLACE|placeholder)", re.I),
    re.compile(r"[<>\[]"),                          # 占位符包裹的伪值
]

# ---- 路径级扫描豁免（仅私有仓库生效，方案 Y 密钥文件豁免）----
# 判定：仓库可见性为 private 时豁免生效；public 下豁免全部失效（防密钥外泄）。
#   mimo_mcp.py                          2026-08-17 授权：真实 OpenAI 密钥，私有可见性兜底
#   ref-material-writing/.env            决策 D-2026-0811-01 授权：真实 ANYSEARCH_API_KEY 入库
# 与 ALLOW_PATTERNS 的关系：此处为「已知密钥文件」级豁免，避免把真实密钥伪装成
# 「占位符误判」，保持值级语义干净。
# 注意：web-search/.env（2026-08-11 决议「绝不入库」）与
# code-review-combo/config/providers.json（仅本地保留、绝不入库）均属「绝不入库」类，
# 一律不豁免、保持扫描阻断（误暂存时仍会被拦截，防外泄双保险）。
EXEMPT_SCAN_PATHS = {"mimo_mcp.py", "ref-material-writing/.env"}


def _repo_is_private() -> bool:
    """仓库是否 private（豁免生效的前提）。

    CI：由环境变量 ``github.repository_visibility`` 判定（smoke.yml 中显式透传
    ``github.repository_visibility``，见 .github/workflows/smoke.yml）。
    本地：未设置该变量时默认按 private 放行（本地仓库本身即私有备份，且历史豁免
    依赖此默认值）；如需强制收紧可设置 ``REPO_VISIBILITY=public``。
    """
    for key in ("github.repository_visibility", "REPO_VISIBILITY"):
        vis = os.environ.get(key, "").strip().lower()
        if vis:
            return vis == "private"
    return True

# ---- .gitignore 策略 ----
# 必须被忽略（保护私有数据）
MUST_IGNORE = [
    "Memory-Data/secret.bin",   # 命中 Memory-Data/* 模式
    "x.7z",                     # 命中 *.7z
    ".workbuddy/x",             # 命中 .workbuddy/
    "Syncfolders_Database_db",
    "__pycache__/x",
    "x.pyc",
    ".venv/x",
    "web-search/.env",          # 2026-08-11 安全决议：真实密钥已落历史、须轮换作废，绝不入库（与 .gitignore 一致）
]
# 必须被跟踪（按用户 #10 策略应入库）
MUST_TRACK = [
    "ref-material-writing/.env",
    "Skill-滴答清单智能任务解析创建器.md",
]

PLACEHOLDER_GUARD = re.compile(
    r"(your|example|xxxx|占位|示例|changeme|REPLACE|placeholder|你的|<+|\[+|自己的)", re.I)


def line_allowed(line: str) -> bool:
    return any(p.search(line) for p in ALLOW_PATTERNS)


def is_placeholder_hit(seg: str) -> bool:
    """命中允许清单，或值本身明显是占位符（如 ... / 你的 / example / 省略号）。"""
    if line_allowed(seg):
        return True
    val = seg.split("=", 1)[1] if "=" in seg else seg
    v = val.strip()
    if not v or v.startswith("...") or v.lstrip("`").startswith("..."):
        return True
    if v.lstrip().startswith("`"):
        return True
    if PLACEHOLDER_GUARD.search(v):
        return True
    return False


def scan_file(rel: str, content: str, rep: Report) -> None:
    for label, pat in DENY_PATTERNS:
        for m in pat.finditer(content):
            seg = m.group(0)
            if is_placeholder_hit(seg):
                continue
            rep.fatal(rel, "secret-scan", f"命中密钥模式[{label}]：{seg[:60]}")


def run(files=None, rep: Report = None) -> Report:
    rep = rep or Report("Tier0")
    targets = files if files is not None else tracked_files()
    for rel in targets:
        # 第三方上游快照目录（chrome-devtools/upstream/）为纯外部代码，非本仓库自有。
        # 按方案 A「不改上游源码」原则跳过密钥扫描，避免上游测试/示例中
        # 口令类、令牌类等敏感字面值被误报（chrome-devtools 方案A落地 G6）。
        if rel.startswith("chrome-devtools/upstream/"):
            continue
        # 路径级豁免：仅私有仓库下生效（见 EXEMPT_SCAN_PATHS 与 _repo_is_private）
        if rel in EXEMPT_SCAN_PATHS and _repo_is_private():
            continue
        p = REPO_ROOT / rel
        if not p.is_file():
            continue
        try:
            if p.stat().st_size > 5_000_000:
                continue
            content = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:  # noqa: BLE001
            continue
        scan_file(rel, content, rep)
    if not rep.fatals:
        rep.ok("__repo__", "secret-scan",
               f"已扫描 {len(targets)} 个文件，未发现高危密钥（ANYSEARCH_API_KEY 已按策略豁免）")

    for path in MUST_IGNORE:
        if is_ignored(path):
            rep.ok(path, "gitignore", "处于忽略状态 ✓")
        else:
            rep.fatal(path, "gitignore", "应被忽略却未被忽略，请检查 .gitignore")
    for path in MUST_TRACK:
        if is_ignored(path):
            rep.fatal(path, "gitignore", "按策略应入库却被忽略，请检查 .gitignore")
        else:
            rep.ok(path, "gitignore", "按策略正常入库 ✓")
    return rep


if __name__ == "__main__":
    targets = staged_files() or None
    r = run(targets)
    for f in r.findings:
        print(f"[{f.severity}] {f.skill}: {f.message}")
    sys.exit(1 if r.fatals else 0)
