#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_firecrawl_spec.py

本脚本追踪 Firecrawl 规范版本、自持、不涉及 web-search。

职责：
- 解析 ref-material-writing 的 references/14-firecrawl-guide.md 中
  「规范版本追踪」小节，提取人工填写的基线版本记录。
- 打印当前记录版本，并提示去何处核对上游 latest 规范。
- 纯标准库实现，不依赖任何外部包；不读取、不引用 web-search 任何文件。
- 不执行任何网络请求；版本核对由人工按指引完成（脚本仅提供指导）。

Firecrawl 规范信息来自 Firecrawl 官方（docs / site / GitHub），
与 web-search 技能无关，本脚本保持自包含。
"""

import os
import re
import sys

# 本脚本所在目录（scripts/），用于定位 references 文档
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_GUIDE = os.path.normpath(
    os.path.join(SCRIPT_DIR, "..", "references", "14-firecrawl-guide.md")
)

# 上游 latest 核对指引（不自动联网，仅提示人工核对地址）
UPSTREAM_HINTS = [
    "Firecrawl 官方文档 / API Reference: https://docs.firecrawl.dev/",
    "Firecrawl MCP 服务器版本说明: npx firecrawl-mcp 的 changelog / release",
    "Firecrawl GitHub 仓库: https://github.com/mendableai/firecrawl",
]


def find_guide_path(explicit=None):
    """返回文档路径；优先使用显式参数，否则回退到默认相对路径。"""
    if explicit:
        return os.path.normpath(explicit)
    return DEFAULT_GUIDE


def extract_tracking_section(text):
    """截取「规范版本追踪」小节文本（到下一个一级/二级标题前）。

    返回 (section_text, found: bool)
    """
    # 匹配 "## 0. 规范版本追踪" 标题行
    m = re.search(
        r'^##\s*0\.\s*规范版本追踪\s*$', text, re.MULTILINE
    )
    if not m:
        return "", False
    start = m.end()
    # 找到下一个 "## " 标题（一级，数字开头）作为结束
    end_m = re.search(r'^##\s+\d+\.', text[start:], re.MULTILINE)
    end = start + end_m.start() if end_m else len(text)
    return text[start:end], True


def parse_placeholder(section, label):
    """从小节中解析形如 '- **<label>**：<value>' 的值。"""
    pattern = r'^\s*-\s*\*\*' + re.escape(label) + r'\*\*\s*[:：]\s*(.+?)\s*$'
    m = re.search(pattern, section, re.MULTILINE)
    if not m:
        return None
    val = m.group(1).strip()
    # 若值被反引号包裹（如 `<VERSION_PLACEHOLDER>`），只取反引号内的占位符/版本串
    bt = re.search(r'`([^`]+)`', val)
    if bt:
        val = bt.group(1).strip()
    else:
        # 否则截取首段（到中文括号或行尾）
        val = re.split(r'[（(]', val)[0].strip().strip('`')
    return val if val else None


def is_placeholder(val):
    """判断值是否仍为未填写的占位符。"""
    if val is None:
        return True
    placeholders = ["<", "placeholder", "待人工", "待填写", "待核对", "version_placeholder"]
    low = val.lower()
    return any(p in low for p in placeholders) or val.strip() == ""


def main(argv):
    guide_path = find_guide_path(argv[1] if len(argv) > 1 else None)

    print("=" * 60)
    print("Firecrawl 规范版本追踪器（自持 / 不涉及 web-search）")
    print("=" * 60)
    print("参考文档: {}".format(guide_path))

    if not os.path.isfile(guide_path):
        print("[错误] 未找到参考文档: {}".format(guide_path))
        print("请确认 references/14-firecrawl-guide.md 存在，或传入其路径作为参数。")
        return 2

    with open(guide_path, "r", encoding="utf-8") as f:
        text = f.read()

    section, found = extract_tracking_section(text)
    if not found:
        print("[警告] 未在文档中找到「规范版本追踪」小节。")
        print("请先在文档中按规范新增该小节后再运行本脚本。")
        return 1

    print("\n[已记录基线版本]")
    fields = [
        ("记录时间", "记录时间"),
        ("Firecrawl API 基线版本", "Firecrawl API 基线版本"),
        ("Firecrawl MCP 服务器版本", "Firecrawl MCP 服务器版本"),
        ("openapi.json 基线来源", "openapi.json 基线来源"),
    ]
    any_filled = False
    for label, key in fields:
        val = parse_placeholder(section, key)
        if val is None:
            val = "(未解析到)"
        status = "待填写(占位符)" if is_placeholder(val) else "已记录"
        if not is_placeholder(val):
            any_filled = True
        print("  - {}: {}  [{}]".format(label, val, status))

    print("\n[上游 latest 核对指引（人工执行）]")
    for hint in UPSTREAM_HINTS:
        print("  * {}".format(hint))

    print("\n[比对结论]")
    if any_filled:
        print("  文档中已记录部分版本信息；请按上方指引与上游 latest 人工比对，")
        print("  若不一致请修订文档 0.1 占位符并记录变更日期。")
    else:
        print("  当前均为占位符，尚未建立基线。请先按文档 0.2/0.3 完成人工填写与首次核对。")

    print("\n[说明] 本脚本仅打印已记录版本与核对指引，不发起任何网络请求，")
    print("       不读取或引用 web-search 文件，保持自包含。")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
