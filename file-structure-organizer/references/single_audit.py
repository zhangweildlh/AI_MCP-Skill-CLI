#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
single_audit.py — file-structure-organizer 单文件审计入口。

支持三层配置优先级：
  1. 命令行参数（--timeout 50）          ← 最高优先级，会话级覆盖
  2. 项目级配置（./config.json）         ← 项目级默认值
  3. Skill 内置配置（references/config.json） ← 兜底默认值

用法：
  python3 single_audit.py <目标文件.md> [--config <配置文件>] [--json] [--report R] [--strict]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# 添加 references 目录到路径
_SKILL_DIR = os.path.dirname(os.path.abspath(__file__))
_REFERENCES_DIR = os.path.join(_SKILL_DIR, "references")
if _REFERENCES_DIR not in sys.path:
    sys.path.insert(0, _REFERENCES_DIR)

from structure_audit import analyze, render_markdown


def load_config(preferred_path=None):
    """加载配置，三层优先级。"""
    # 1. 优先读取命令行传入的路径
    if preferred_path and os.path.isfile(preferred_path):
        try:
            with open(preferred_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[警告] 读取配置文件失败 {preferred_path}: {e}",
                  file=sys.stderr)

    # 2. 尝试读取当前目录的 config.json
    project_config = os.path.join(os.getcwd(), "config.json")
    if os.path.isfile(project_config):
        try:
            with open(project_config, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[警告] 读取项目配置失败 {project_config}: {e}",
                  file=sys.stderr)

    # 3. 兜底：使用 Skill 内置配置
    skill_config_path = os.path.join(_SKILL_DIR, "config.json")
    if os.path.isfile(skill_config_path):
        try:
            with open(skill_config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[警告] 读取 Skill 配置失败 {skill_config_path}: {e}",
                  file=sys.stderr)

    # 返回空字典（使用硬编码默认值）
    return {}


def validate_config(config):
    """验证配置合法性，返回清理后的配置。"""
    validated = {
        "banned_terms_path": "references/banned_terms.txt",
        "default_banned_terms": [
            "视情况", "一般", "通常", "酌情", "尽量", "尽可能",
            "适当", "必要时", "原则上", "建议"
        ],
        "audit": {"max_file_size_kb": 500, "timeout_seconds": 30,
                  "parallel_workers": 4},
        "report": {"output_format": "markdown",
                   "include_fix_hints": True, "include_evidence": True}
    }

    # 合并用户配置
    for key in ["banned_terms_path", "default_banned_terms"]:
        if key in config:
            validated[key] = config[key]

    if "audit" in config and isinstance(config["audit"], dict):
        validated["audit"].update(config["audit"])

    if "report" in config and isinstance(config["report"], dict):
        validated["report"].update(config["report"])

    return validated


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="file-structure-organizer 单文件审计入口")
    ap.add_argument("target", help="待检测的 Markdown 文件路径")
    ap.add_argument("--config", help="配置文件路径（可选）")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--report", help="报告写入文件")
    ap.add_argument("--strict", action="store_true",
                    help="有 error 则 exit 1")
    args = ap.parse_args(argv)

    # 验证文件存在
    if not os.path.isfile(args.target):
        print(f"❌ 文件不存在：{args.target}", file=sys.stderr)
        return 2
    if not args.target.lower().endswith((".md", ".markdown")):
        print(f"❌ 非 Markdown 文件：{args.target}", file=sys.stderr)
        return 2

    # 加载并验证配置
    raw_config = load_config(args.config)
    config = validate_config(raw_config)

    # 设置禁用词表路径（如果配置中有）
    if "banned_terms_path" in config:
        os.environ["BANNED_TERMS_PATH"] = config["banned_terms_path"]

    try:
        report = analyze(args.target)
    except Exception as e:
        print(f"❌ 分析异常：{e}", file=sys.stderr)
        return 3

    # 生成输出
    if args.json:
        rendered = json.dumps(report, ensure_ascii=False, indent=2)
    else:
        rendered = render_markdown(report)

    # 写入报告或输出到 stdout
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            f.write(rendered)
        print(f"报告已写入：{args.report}")
    else:
        print(rendered)

    # 严格模式检查
    if args.strict and report["summary"]["issue_error"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
