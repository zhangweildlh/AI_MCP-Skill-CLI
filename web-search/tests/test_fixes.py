#!/usr/bin/env python3
"""web-search 审计修复回归测试（stdlib unittest，无第三方依赖，仅需 requests 供被测脚本导入）。

验证 F2/F4/F7/F8 等审计发现的修复契约：
- F2：anysearch_cli.py 的 `_load_env` 能从 web-search/.env（script_dir/../../.env）解析 ANYSEARCH_API_KEY
- F4：父 SKILL.md 不再硬编码 D:\\Tools\\Assembly 本机绝对路径
- F7：firecrawl/SKILL.md 的 interact 用 --prompt 而非 --task
- F7 真实契约：firecrawl interact --help 含 --prompt

运行：python -m unittest discover -s web-search/tests -v
"""

import importlib.util
import os
import shutil
import subprocess
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB_SEARCH = os.path.join(REPO_ROOT, "web-search")
SKILL_MD = os.path.join(WEB_SEARCH, "SKILL.md")
FIRECRAWL_SKILL_MD = os.path.join(WEB_SEARCH, "firecrawl", "SKILL.md")
DOTENV = os.path.join(WEB_SEARCH, ".env")
ANYSEARCH_CLI = os.path.join(WEB_SEARCH, "anysearch-skill", "scripts", "anysearch_cli.py")


def _load_anysearch_cli_module():
    """导入 anysearch_cli.py 以触发其模块级 `_load_env()`，随后可检查 os.environ。"""
    spec = importlib.util.spec_from_file_location("anysearch_cli_under_test", ANYSEARCH_CLI)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestAuditFixes(unittest.TestCase):
    def test_f2_env_load_resolves_parent_env(self):
        # B12 加固：不仅断言 .env 存在，更要验证 _load_env 真的探测 web-search/.env（script_dir/../../.env）。
        # 若 F2 修复被回退（删掉第三探测项），web-search/.env 不会被加载，ANYSEARCH_API_KEY 为空 → 本测试 FAIL。
        self.assertTrue(os.path.isfile(DOTENV), "web-search/.env 应存在，供 _load_env 解析")
        saved = os.environ.pop("ANYSEARCH_API_KEY", None)
        try:
            _load_anysearch_cli_module()  # 触发 _load_env
            self.assertTrue(
                os.environ.get("ANYSEARCH_API_KEY"),
                "F2 修复后 _load_env 应能从 web-search/.env 解析 ANYSEARCH_API_KEY",
            )
        finally:
            if saved is None:
                os.environ.pop("ANYSEARCH_API_KEY", None)
            else:
                os.environ["ANYSEARCH_API_KEY"] = saved

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
        # B13 修复：用 shutil.which 解析（Windows 下含 .cmd 后缀），避免 subprocess 找不到无扩展名可执行
        exe = shutil.which("firecrawl")
        if exe is None:
            self.skipTest("firecrawl CLI 不可用（未安装或未在 PATH）")
            return
        try:
            result = subprocess.run(
                [exe, "interact", "--help"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        except Exception as e:  # 执行异常时跳过，不阻断
            self.skipTest(f"firecrawl 执行失败：{e}")
            return
        out = result.stdout
        self.assertIn("--prompt", out, "firecrawl interact 应支持 --prompt 选项")
        self.assertIn("Interact with a scraped page", out)


if __name__ == "__main__":
    unittest.main()
