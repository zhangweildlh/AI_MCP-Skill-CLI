#!/usr/bin/env python3
"""web-search 审计修复回归测试（stdlib unittest，无第三方依赖）。

验证 F2/F4/F7/F8 等审计发现的修复契约：
- F2：anysearch_cli.py 已向上探测 web-search/.env（解析目标存在）
- F4：父 SKILL.md 不再硬编码 D:\\Tools\\Assembly 本机绝对路径
- F7：firecrawl/SKILL.md 的 interact 用 --prompt 而非 --task
- F7 真实契约：firecrawl interact --help 含 --prompt

运行：uv run python -m unittest web-search.tests.test_fixes
"""

import os
import subprocess
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB_SEARCH = os.path.join(REPO_ROOT, "web-search")
SKILL_MD = os.path.join(WEB_SEARCH, "SKILL.md")
FIRECRAWL_SKILL_MD = os.path.join(WEB_SEARCH, "firecrawl", "SKILL.md")
DOTENV = os.path.join(WEB_SEARCH, ".env")


class TestAuditFixes(unittest.TestCase):
    def test_f2_env_load_target_exists(self):
        # F2 修复目标：anysearch_cli.py 现已向上探测 web-search/.env（script_dir/../../.env）
        self.assertTrue(os.path.isfile(DOTENV), "web-search/.env 应存在，供 _load_env 解析")

    def test_f4_no_hardcoded_assembly_path(self):
        # F4 修复：父 SKILL.md 不应再硬编码 D:\Tools\Assembly 绝对路径
        with open(SKILL_MD, encoding="utf-8") as f:
            content = f.read()
        self.assertNotIn(
            r"D:\Tools\Assembly",
            content,
            "SKILL.md 不应再含硬编码本机绝对路径 D:\\Tools\\Assembly",
        )

    def test_f7_interact_uses_prompt_not_task(self):
        # F7 修复：firecrawl/SKILL.md 的 interact 推荐模板应使用 --prompt 而非 --task
        with open(FIRECRAWL_SKILL_MD, encoding="utf-8") as f:
            content = f.read()
        self.assertIn("--prompt", content, "firecrawl/SKILL.md 应展示 interact --prompt")
        self.assertNotRegex(
            content,
            r"interact\s+<URL>\s+--task",
            "不应再以 --task 作为 interact 推荐命令模板",
        )

    def test_f7_cli_contract(self):
        # F7 真实契约：firecrawl interact --help 应包含 --prompt
        try:
            result = subprocess.run(
                ["firecrawl", "interact", "--help"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except Exception as e:  # 环境无 firecrawl CLI 时跳过，不阻断
            self.skipTest(f"firecrawl CLI 不可用：{e}")
            return
        out = result.stdout
        self.assertIn("--prompt", out, "firecrawl interact 应支持 --prompt 选项")
        self.assertIn("Interact with a scraped page", out)


if __name__ == "__main__":
    unittest.main()
