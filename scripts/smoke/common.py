#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""common.py —— 五层冒烟测试共享工具。

职责：
  1. 技能发现（discover_skills）：定位目录技能（含 SKILL.md）与单文件技能（Skill-*.md）
  2. frontmatter 解析（parse_frontmatter）：极简 YAML 前置元数据解析，无需第三方依赖
  3. 报告聚合（Report / Finding）：统一收集致命/警告/信息，供编排器汇总
  4. git 辅助（git / is_ignored / tracked_files / run_cmd）

设计原则：纯 Python 标准库实现，本地与 CI（云端）零依赖即可运行。
"""
from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

# 仓库根目录：scripts/smoke/common.py -> parents[2] == repo root
REPO_ROOT = Path(__file__).resolve().parents[2]

# name 合法字符：小写字母 / 数字 / 连字符（对齐 skill-checker 维度 1.4）
NAME_RE = re.compile(r"^[a-z0-9-]+$")


class Severity:
    FATAL = "FATAL"   # 致命：阻断提交 / 合并
    WARN = "WARN"     # 警告：需关注；--strict 模式下阻断
    INFO = "INFO"     # 一般信息
    OK = "OK"         # 通过


@dataclass
class Finding:
    tier: str
    skill: str
    check: str
    severity: str
    message: str


@dataclass
class Report:
    tier: str
    findings: List[Finding] = field(default_factory=list)

    def add(self, skill: str, check: str, severity: str, message: str) -> None:
        self.findings.append(Finding(self.tier, skill, check, severity, message))

    def ok(self, skill: str, check: str, message: str = "") -> None:
        self.add(skill, check, Severity.OK, message)

    def fatal(self, skill: str, check: str, message: str) -> None:
        self.add(skill, check, Severity.FATAL, message)

    def warn(self, skill: str, check: str, message: str) -> None:
        self.add(skill, check, Severity.WARN, message)

    def info(self, skill: str, check: str, message: str) -> None:
        self.add(skill, check, Severity.INFO, message)

    @property
    def fatals(self) -> List[Finding]:
        return [f for f in self.findings if f.severity == Severity.FATAL]

    @property
    def warns(self) -> List[Finding]:
        return [f for f in self.findings if f.severity == Severity.WARN]


@dataclass
class Skill:
    path: Path          # SKILL.md 路径，或单文件技能 .md 路径
    name_field: Optional[str]
    ftype: str          # "dir" 目录技能 | "single" 单文件技能
    dir_name: Optional[str]
    body: str

    @property
    def rel(self) -> str:
        return str(self.path.relative_to(REPO_ROOT))

    @property
    def base(self) -> Path:
        # 引用文件解析基准目录
        return self.path.parent


def _parse_yaml_lines(fm_lines) -> dict:
    meta: dict = {}
    cur_key: Optional[str] = None
    for ln in fm_lines:
        m = re.match(r"^([A-Za-z_][\w-]*):\s?(.*)$", ln)
        if m and not ln.startswith(" "):
            key, val = m.group(1), m.group(2).strip()
            meta[key] = val
            cur_key = key
        elif ln.startswith(" ") and cur_key:
            if isinstance(meta.get(cur_key), str):
                meta[cur_key] = meta[cur_key] + "\n" + ln.strip()
    return meta


def _parse_fenced(lines):
    if not lines or lines[0].strip() != "---":
        return {}, "\n".join(lines), False, False
    end = None
    for i in range(1, min(len(lines), 60)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}, "\n".join(lines), False, False
    meta = _parse_yaml_lines(lines[1:end])
    body = "\n".join(lines[end + 1:])
    return meta, body, True, True


def _parse_implicit(lines):
    """无 --- 围栏、但顶部为 key: value 块时，按隐式 frontmatter 解析。"""
    meta: dict = {}
    cur_key: Optional[str] = None
    collected = False
    end = len(lines)
    for i, ln in enumerate(lines):
        if ln.strip() == "":
            if collected:
                j = i + 1
                while j < len(lines) and lines[j].strip() == "":
                    j += 1
                if j < len(lines):
                    nxt = lines[j]
                    if not (nxt.startswith(" ")
                            or re.match(r"^[A-Za-z_][\w-]*:", nxt)):
                        end = i
                        break
                else:
                    end = i
                    break
            continue
        if ln.startswith(" "):
            if cur_key and isinstance(meta.get(cur_key), str):
                meta[cur_key] = meta[cur_key] + "\n" + ln.strip()
            continue
        m = re.match(r"^([A-Za-z_][\w-]*):\s?(.*)$", ln)
        if m:
            key, val = m.group(1), m.group(2).strip()
            meta[key] = val
            cur_key = key
            collected = True
        else:
            end = i
            break
    body = "\n".join(lines[end:])
    ok = bool(meta.get("name") or meta.get("description"))
    return meta, body, ok, False


def parse_frontmatter(text: str) -> Tuple[dict, str, bool, bool]:
    """解析 YAML 前置元数据。

    返回 (meta, body, ok, fenced)。兼容三种形态：
      - 标准围栏：文件首行 ``---`` … 闭合 ``---``（fenced=True）
      - 标题在前：前 20 行内存在 ``---`` 围栏（fenced=True）
      - 隐式块：顶部直接为 ``name:/description:`` 等 key（无围栏，fenced=False，建议补围栏）
    """
    lines = text.splitlines()
    if lines and lines[0].strip() == "---":
        return _parse_fenced(lines)
    # 标题在前的围栏形态
    for i in range(min(len(lines), 20)):
        if lines[i].strip() == "---":
            meta, body, ok, _ = _parse_fenced(lines[i:])
            return meta, body, ok, True
    # 隐式 frontmatter（无围栏）
    return _parse_implicit(lines)


def discover_skills(root: Path = REPO_ROOT) -> List[Skill]:
    """发现仓库内全部技能。

    - 目录技能：顶层目录含 SKILL.md
    - 单文件技能：仓库根目录的 Skill-*.md
    """
    skills: List[Skill] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        sk = entry / "SKILL.md"
        if sk.exists():
            text = sk.read_text(encoding="utf-8", errors="replace")
            meta, body, _, _ = parse_frontmatter(text)
            skills.append(Skill(path=sk, name_field=meta.get("name"),
                                ftype="dir", dir_name=entry.name, body=body))
    for entry in sorted(root.glob("Skill-*.md")):
        if entry.is_file():
            text = entry.read_text(encoding="utf-8", errors="replace")
            meta, body, _, _ = parse_frontmatter(text)
            skills.append(Skill(path=entry, name_field=meta.get("name"),
                                ftype="single", dir_name=None, body=body))
    return skills


def git(*args, cwd: Optional[Path] = None) -> str:
    try:
        r = subprocess.run(["git", *args], cwd=cwd or REPO_ROOT,
                           capture_output=True, text=True)
        return r.stdout.strip()
    except Exception:
        return ""


def tracked_files() -> List[str]:
    return [p for p in git("ls-files").splitlines() if p.strip()]


def is_ignored(path: str) -> bool:
    r = subprocess.run(["git", "check-ignore", path], cwd=REPO_ROOT,
                       capture_output=True, text=True)
    return r.returncode == 0


def run_cmd(cmd, cwd: Optional[Path] = None, timeout: int = 120):
    try:
        r = subprocess.run(cmd, cwd=cwd or REPO_ROOT, capture_output=True,
                           text=True, timeout=timeout,
                           shell=isinstance(cmd, str))
        return r.returncode, r.stdout, r.stderr
    except Exception as e:  # noqa: BLE001
        return -1, "", str(e)


def name_valid(name: str) -> Tuple[bool, List[str]]:
    problems: List[str] = []
    if not name:
        return False, ["name 为空"]
    if not NAME_RE.match(name):
        problems.append("name 含非法字符（仅允许小写字母/数字/连字符）")
    if not (1 <= len(name) <= 64):
        problems.append("name 长度不在 1–64")
    if name.startswith("-"):
        problems.append("name 以连字符开头")
    if name.endswith("-"):
        problems.append("name 以连字符结尾")
    if "--" in name:
        problems.append("name 含连续连字符 --")
    return (len(problems) == 0), problems


def staged_files() -> List[str]:
    """预提交钩子场景：仅扫描已暂存(staged)文件。"""
    return [p for p in git("diff", "--cached", "--name-only").splitlines() if p.strip()]
