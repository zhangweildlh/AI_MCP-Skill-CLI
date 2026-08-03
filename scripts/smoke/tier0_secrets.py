#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier 0 · 入库前门禁（防泄密 + 防误提交）。

两项检查：
  1. 密钥扫描：对（暂存或已跟踪）文件扫描高危密钥模式，命中即致命阻断。
  2. .gitignore 策略校验：确保敏感目录被忽略、按策略应入库的文件未被忽略。

关于 ANYSEARCH_API_KEY：
  按用户明确决策（#10），web-search/.env 与 ref-material-writing/.env 中的真实
  ANYSEARCH_API_KEY 已授权入库。因此该 Key 被列入允许清单，扫描命中不报致命。
  若日后希望收紧，移除 ALLOW_PATTERNS 中对应条目即可。
"""
from __future__ import annotations

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
]
# 必须被跟踪（按用户 #10 策略应入库）
MUST_TRACK = [
    "web-search/.env",
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
