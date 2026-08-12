#!/usr/bin/env python3
"""产物 schema 校验器（web-search 阶段 E 交付自检，纯标准库）。

把父技能 SKILL.md「交付自检：产物必须含采信标记与来源清单」这一人工门禁，
沉淀为可机器断言的代码。本模块只依赖标准库 `re`，绝不 import requests 等三方包，
以便与 web-search 现有测试套件（`uv run --with requests python -m unittest discover`）
在任意环境下一致运行。

对外唯一接口：
    validate_output_markdown(text: str) -> list[str]
        返回违规信息字符串列表；空列表表示合规。

校验规则（顺序即检查顺序）：
    1. 空文本/全空白            -> "文档为空"
    2. 采信标记                  -> 优先带标签形式
                                   ✅互证 / ⚠️单源 / ❌冲突已裁决 / ➖缺失；
                                   若都没有，再用裸符号兜底 ✅|⚠️|❌|➖；
                                   二者皆无 -> "缺少采信标记"
    3. 来源清单                  -> 必须含「来源清单」字样（正则 `来源清单`）
                                   无 -> 对应违规
    4. 来源项                    -> 来源清单下至少一项来源行，
                                   匹配 AnySearch|Firecrawl|原生兜底；
                                   无 -> "来源清单为空"
"""

import re

# 带标签的采信标记（四级采信标记的标准写法）
_LABELLED_MARK = re.compile(r"✅互证|⚠️单源|❌冲突已裁决|➖缺失")

# 裸符号兜底：当文档未使用标准标签写法时，仍以裸符号判定存在采信标记，
# 降低漏判概率（例如只写了 ⚠️ 而未补「单源」）。
_BARE_MARK = re.compile(r"✅|⚠️|❌|➖")

# 来源清单标题/行内字样
_SOURCE_LIST = re.compile(r"来源清单")

# 来源项：允许 `- AnySearch:` / `- Firecrawl:` / `- 原生兜底:` 等形态
_SOURCE_ITEM = re.compile(r"AnySearch|Firecrawl|原生兜底")


def validate_output_markdown(text: str) -> list[str]:
    """校验落盘素材 Markdown 文本是否符合 web-search 输出 schema。

    参数:
        text: 落盘的 `<主题>_搜索素材.md` 全文。
    返回:
        违规信息字符串列表；空列表表示完全合规。
    """
    violations: list[str] = []

    # 规则 1：空文本 / 全空白
    if text is None or text.strip() == "":
        violations.append("文档为空")
        return violations

    # 规则 2：采信标记
    has_labelled = bool(_LABELLED_MARK.search(text))
    has_bare = bool(_BARE_MARK.search(text)) if not has_labelled else True
    if not (has_labelled or has_bare):
        violations.append("缺少采信标记（须含 ✅互证 / ⚠️单源 / ❌冲突已裁决 / ➖缺失）")

    # 规则 3：来源清单字样
    source_list_match = _SOURCE_LIST.search(text)
    has_source_list = bool(source_list_match)
    if not has_source_list:
        violations.append("缺少「来源清单」（须含 来源清单 字样）")

    # 规则 4：来源清单「下」至少一项来源行。
    # 仅在「来源清单」首次出现之后的文本中检索来源项，避免 核心事实 段中
    # 出现的「来源：AnySearch+Firecrawl」等行文被误计为来源清单条目。
    if has_source_list:
        tail = text[source_list_match.end():]
        if not _SOURCE_ITEM.search(tail):
            violations.append("来源清单为空（须至少含一项 AnySearch / Firecrawl / 原生兜底）")

    return violations


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        path = sys.argv[1]
        with open(path, encoding="utf-8") as fh:
            content = fh.read()
        res = validate_output_markdown(content)
        if res:
            print("违规：")
            for v in res:
                print("  - " + v)
            sys.exit(1)
        else:
            print("合规")
