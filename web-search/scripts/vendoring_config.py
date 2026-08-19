#!/usr/bin/env python3
"""web-search 上游 vendoring 共享配置（纯数据，仅依赖标准库）。

单一常量源：``sync_anysearch.py`` 与 ``check_upstream_drift.py`` 均从此模块导入
``ALLOWLIST``，避免两处硬编码清单在未来上游新增文件时割裂
（审计 finding M1：双份 ALLOWLIST 导致同步基线与漂移检测不一致）。

本模块刻意只含常量、不含任何逻辑，可被两脚本以「同目录直接 import」方式加载，
也不破坏 ``check_upstream_drift.py`` 的「仅依赖标准库」独立性。
"""
from __future__ import annotations

# 允许 vendoring 的上游文件（相对 anysearch-skill/ 的路径）。
# 上游新增文件须同步更新此清单；sync 与 drift 共用，切勿在别处再硬编码一份。
ALLOWLIST = [
    "SKILL.md",
    "LICENSE",
    "NOTICE",
    "README.md",
    "README_zh.md",
    "SECURITY.md",
    ".env.example",
    "requirements.txt",
    "runtime.conf.example",
    "scripts/anysearch_cli.py",
    "scripts/anysearch_cli.js",
    "scripts/anysearch_cli.ps1",
    "scripts/anysearch_cli.sh",
    "scripts/generate.py",
    "scripts/shared/constants.json",
    "scripts/shared/doc_spec.md",
]

# 上游仓库坐标（GitHub）
UPSTREAM_REPO = "anysearch-ai/anysearch-skill"
DEFAULT_REF = "main"

# vendored 副本目录名（相对 web-search/）
VENDOR_DIRNAME = "anysearch-skill"
