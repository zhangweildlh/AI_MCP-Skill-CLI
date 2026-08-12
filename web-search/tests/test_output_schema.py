#!/usr/bin/env python3
"""validate_output.py 全场景 + 全边界 + 对抗式测试套件（stdlib unittest）。

运行（与 web-search 既有套件一致，必须走 uv）：
    uv run --with requests python -m unittest discover -s web-search/tests -v
    # 或单文件：
    uv run --with requests python -m unittest web-search.tests.test_output_schema -v

被测对象：web-search/validate_output.py -> validate_output_markdown(text) -> list[str]
空列表=合规；非空=违规信息列表。

对抗式测试哲学：
    先假设 validate_output_markdown「是错的」——会漏判缺失标记、会误收空来源、
    会误收缺来源清单的产物。再用下方负向（边界/对抗）用例去证实或证伪。
    若某个负向用例在本实现下意外「通过」（说明实现有漏洞），必须先修正实现再交付。
    本套件做到：任何一条核心规则被篡改失效，都至少有一个用例转红。
"""

import importlib.util
import os
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB_SEARCH = os.path.join(REPO_ROOT, "web-search")
VALIDATE_PY = os.path.join(WEB_SEARCH, "validate_output.py")


def _load_validator():
    """导入真实 validate_output.py（与 test_full.py 同一加载范式）。"""
    spec = importlib.util.spec_from_file_location("validate_output_under_test", VALIDATE_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


validate_output_markdown = _load_validator().validate_output_markdown


class TestOutputSchema(unittest.TestCase):
    # ------------------------------------------------------------------ #
    # 正常场景（正向：期望返回空列表 = 合规）
    # ------------------------------------------------------------------ #
    def test_normal_dual_source(self):
        """正常：✅互证 + 来源清单 + 双源(AnySearch+Firecrawl) → 合规。"""
        doc = (
            "## 主题：成渝中线高铁\n"
            "### 核心事实\n"
            "- [✅互证] 正线全长约 291 公里 — 来源：AnySearch+Firecrawl\n"
            "### 来源清单\n"
            "- AnySearch: 成渝中线高铁 线路里程\n"
            "- Firecrawl: 成渝中线高铁 线路里程\n"
        )
        self.assertEqual(validate_output_markdown(doc), [])

    def test_all_four_marks(self):
        """四标记齐全：✅⚠️❌➖ 同时存在 → 合规。"""
        doc = (
            "## 主题：政策发布日期\n"
            "### 核心事实\n"
            "- [✅互证] 事实A — 来源：AnySearch+Firecrawl\n"
            "- [⚠️单源] 事实B — 来源：Firecrawl（待核实）\n"
            "- [❌冲突已裁决] 事实C — 采纳官方日期\n"
            "- [➖缺失] 事实D — 两源均无\n"
            "### 来源清单\n"
            "- AnySearch: 查询\n"
            "- Firecrawl: 查询\n"
            "- 原生兜底: 查询\n"
        )
        self.assertEqual(validate_output_markdown(doc), [])

    def test_single_source_only(self):
        """仅 ⚠️单源（单源场景）：只有 ⚠️单源 + 来源清单 + 单源项 → 合规（单源允许）。"""
        doc = (
            "## 主题：小众标准参数\n"
            "### 核心事实\n"
            "- [⚠️单源] 技术参数 X=12 — 来源：Firecrawl（待核实）\n"
            "### 来源清单\n"
            "- Firecrawl: 小众标准 技术参数\n"
        )
        self.assertEqual(validate_output_markdown(doc), [])

    # ------------------------------------------------------------------ #
    # 边界场景（期望命中某条明确违规）
    # ------------------------------------------------------------------ #
    def test_boundary_missing_mark(self):
        """边界-缺标记：有来源清单、有来源项，但无任何采信标记 → 命中「缺少采信标记」。"""
        doc = (
            "## 主题：某事实\n"
            "### 核心事实\n"
            "- 事实A — 来源：AnySearch+Firecrawl\n"
            "### 来源清单\n"
            "- AnySearch: 查询\n"
            "- Firecrawl: 查询\n"
        )
        violations = validate_output_markdown(doc)
        self.assertTrue(any("缺少采信标记" in v for v in violations),
                        f"应判缺少采信标记，实际：{violations}")

    def test_boundary_missing_source_list(self):
        """边界-缺来源清单：有标记但无「来源清单」字样 → 命中对应违规。"""
        doc = (
            "## 主题：某事实\n"
            "### 核心事实\n"
            "- [✅互证] 事实A — 来源：AnySearch+Firecrawl\n"
            "### 来源\n"
            "- AnySearch: 查询\n"
            "- Firecrawl: 查询\n"
        )
        violations = validate_output_markdown(doc)
        self.assertTrue(any("来源清单" in v for v in violations),
                        f"应判缺少来源清单，实际：{violations}")
        self.assertFalse(any("文档为空" in v for v in violations))

    def test_boundary_empty_source_list(self):
        """边界-来源清单空：有「来源清单」标题但无来源项 → 命中「来源清单为空」。"""
        doc = (
            "## 主题：某事实\n"
            "### 核心事实\n"
            "- [✅互证] 事实A — 来源：AnySearch+Firecrawl\n"
            "### 来源清单\n"
            "（本主题两源均未返回可用结果）\n"
        )
        violations = validate_output_markdown(doc)
        self.assertTrue(any("来源清单为空" in v for v in violations),
                        f"应判来源清单为空，实际：{violations}")

    def test_boundary_empty_file(self):
        """边界-空文件：空串 → 命中「文档为空」。"""
        violations = validate_output_markdown("")
        self.assertEqual(violations, ["文档为空"])

    def test_boundary_whitespace_only(self):
        """边界-全空白：仅空白字符 → 命中「文档为空」（证明空判定不漏）。"""
        violations = validate_output_markdown("   \n\t  \n")
        self.assertEqual(violations, ["文档为空"])

    # ------------------------------------------------------------------ #
    # 对抗场景（负向用例：刻意构造「看起来像产物但违规」的文档，
    #          必须用对应违规捕获，证明校验器不会误收）
    # ------------------------------------------------------------------ #
    def test_adversarial_source_list_no_mark(self):
        """对抗-有来源清单无标记：只有 来源清单+来源项、故意零标记 → 必须判违规。

        若校验器对「缺失标记」漏判，本例会误收为合规 → 用例转红，暴露 BUG。
        """
        doc = (
            "## 主题：对抗样本\n"
            "### 核心事实\n"
            "- 事实A 来自两源\n"
            "- 事实B 来自单源\n"
            "### 来源清单\n"
            "- AnySearch: 对抗 查询\n"
            "- Firecrawl: 对抗 查询\n"
        )
        violations = validate_output_markdown(doc)
        self.assertTrue(any("缺少采信标记" in v for v in violations),
                        f"对抗样本不应被收为合规，应判缺少采信标记，实际：{violations}")
        # 同时确认它并没有被误判为「来源清单为空」或「文档为空」
        self.assertFalse(any("来源清单为空" in v for v in violations))
        self.assertFalse(any("文档为空" in v for v in violations))

    def test_adversarial_mark_no_source_list(self):
        """对抗-有标记无来源清单：有标记但完全无「来源清单」 → 必须判违规。

        若校验器对「缺来源清单」漏判，本例会误收 → 用例转红，暴露 BUG。
        """
        doc = (
            "## 主题：对抗样本\n"
            "### 核心事实\n"
            "- [✅互证] 事实A — 来源：AnySearch+Firecrawl\n"
            "- [⚠️单源] 事实B — 来源：Firecrawl\n"
            "### 参考来源\n"
            "- AnySearch: 查询\n"
            "- Firecrawl: 查询\n"
        )
        violations = validate_output_markdown(doc)
        self.assertTrue(any("来源清单" in v for v in violations),
                        f"对抗样本不应被收为合规，应判缺少来源清单，实际：{violations}")

    def test_bare_symbol_fallback(self):
        """裸符号兜底：仅用裸 ⚠️（无「单源」标签）的文档 → 兜底识别为标记，判合规。

        显式断言：本实现靠裸符号兜底识别该文档含采信标记（而非仅靠带标签正则）。
        若实现只认带标签形式而丢弃裸符号兜底，本例会误判「缺少采信标记」→ 转红。
        """
        doc = (
            "## 主题：裸符号样本\n"
            "### 核心事实\n"
            "- ⚠️ 事实A 仅单源（未补标签）\n"
            "### 来源清单\n"
            "- Firecrawl: 裸符号 查询\n"
        )
        self.assertEqual(validate_output_markdown(doc), [])

    def test_bare_symbol_fallback_is_required(self):
        """对抗-兜底必要性：证明若去掉裸符号兜底会漏判。

        构造一个只含裸 ⚠️ 但「带标签正则」扫不到的文档，断言本实现仍能识别为合规；
        再用一个只走带标签正则可被绕过的思路反证——这里直接校验兜底分支生效：
        文档不含任何带标签标记，但仍被判合规（说明是裸符号兜住在起作用）。
        """
        doc = (
            "### 核心事实\n"
            "- ⚠️ 仅裸符号\n"
            "### 来源清单\n"
            "- 原生兜底: 查询\n"
        )
        # 带标签正则单独扫应失败：
        import re
        labelled = re.compile(r"✅互证|⚠️单源|❌冲突已裁决|➖缺失")
        self.assertFalse(labelled.search(doc), "前置：带标签正则本不应命中裸符号文档")
        # 但完整校验器应判合规（裸符号兜底生效）：
        self.assertEqual(validate_output_markdown(doc), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
