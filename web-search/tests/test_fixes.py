#!/usr/bin/env python3
"""web-search 审计修复回归测试（stdlib unittest；被测脚本 anysearch_cli.py 需要 requests）。

覆盖的审计契约：
- F2  ：orchestrate._load_parent_api_key 能从 web-search/.env 解析 ANYSEARCH_API_KEY（解耦后密钥注入点）
- F4  ：父 SKILL.md 不再硬编码 D:\\Tools\\Assembly 本机绝对路径
- F7  ：firecrawl/SKILL.md 的 interact 用 --prompt 而非 --task（文档契约）
- F7' ：firecrawl CLI 真实契约（`firecrawl interact --help` 含 --prompt）
- C8  ：firecrawl/SKILL.md 不得给出把 FIRECRAWL_API_KEY 落盘写入 .env 的指引
- C10 ：父 SKILL.md 与 README.md 的调用契约（脚本路径 / 密钥位置）互相一致
- D2/D4：子技能 anysearch-skill/SKILL.md 已去本地化 overlay（为纯上游 vendored 副本，非独立 clone）
- E2  ：三份文档一律不得出现指向 anysearch-skill 的 git clone / submodule 指令（按指令形态布防，不依赖文案措辞）
- D8/E4：解耦后上游 `_load_env` 不含父级 .env 三级探测补丁；`orchestrate._load_parent_api_key` 就近优先

运行（必须走 uv，禁裸 python —— 裸 python 缺 requests 会直接 ERROR）：
    uv run --with requests python -m unittest discover -s web-search/tests -v
"""

import os
import shutil
import subprocess
import sys
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB_SEARCH = os.path.join(REPO_ROOT, "web-search")
SKILL_MD = os.path.join(WEB_SEARCH, "SKILL.md")
README_MD = os.path.join(WEB_SEARCH, "README.md")
FIRECRAWL_SKILL_MD = os.path.join(WEB_SEARCH, "firecrawl", "SKILL.md")
ANYSEARCH_SKILL_MD = os.path.join(WEB_SEARCH, "anysearch-skill", "SKILL.md")
DOTENV = os.path.join(WEB_SEARCH, ".env")
ANYSEARCH_CLI = os.path.join(WEB_SEARCH, "anysearch-skill", "scripts", "anysearch_cli.py")

if WEB_SEARCH not in sys.path:
    sys.path.insert(0, WEB_SEARCH)
import orchestrate  # noqa: E402


# E2：识别「真实可执行的 git 指令」而非「禁令说明文字」。
# 判据：命令片段内不含中日韩文字与中文标点——文档里的禁令说明必然夹带中文
#（例："在父仓库内 `git clone` 会生成嵌套 .git，导致 web-search/anysearch-skill/ 脱管"），
# 而可复制执行的命令行不会。以此避免把「禁止 clone」的说明误判成「给出 clone 指令」。
_NO_CJK = r"[^\n\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]*"
GIT_CLONE_ANYSEARCH_RE = r"git\s+clone\b" + _NO_CJK + r"anysearch[\w-]*"
GIT_SUBMODULE_ANYSEARCH_RE = r"git\s+submodule\s+(?:add|update)\b" + _NO_CJK + r"anysearch[\w-]*"


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


class TestAuditFixes(unittest.TestCase):
    def test_f2_env_load_resolves_parent_env(self):
        # 解耦后密钥注入点已从 anysearch_cli.py::_load_env 上移至 orchestrate._load_parent_api_key。
        # 本用例改为断言：orchestrate._load_parent_api_key 能真实从 web-search/.env 解析 ANYSEARCH_API_KEY。
        self.assertTrue(os.path.isfile(DOTENV), "web-search/.env 应存在，供 _load_parent_api_key 解析")
        key = orchestrate._load_parent_api_key(WEB_SEARCH)
        self.assertTrue(
            key,
            "F2 修复后 orchestrate._load_parent_api_key 应能从 web-search/.env 解析 ANYSEARCH_API_KEY",
        )

    def test_f4_no_hardcoded_assembly_path(self):
        # F4 修复：父 SKILL.md 不应再硬编码 D:\Tools\Assembly 绝对路径
        self.assertNotIn(
            r"D:\Tools\Assembly",
            _read(SKILL_MD),
            "SKILL.md 不应再含硬编码本机绝对路径 D:\\Tools\\Assembly",
        )

    def test_f7_interact_uses_prompt_not_task(self):
        # F7 修复：firecrawl/SKILL.md 的 interact 推荐模板应使用 --prompt 而非 --task
        content = _read(FIRECRAWL_SKILL_MD)
        self.assertIn("--prompt", content, "firecrawl/SKILL.md 应展示 interact --prompt")
        self.assertNotRegex(
            content,
            r"interact\s+<URL>\s+--task",
            "不应再以 --task 作为 interact 推荐命令模板",
        )

    def test_c8_no_firecrawl_key_persisted_to_dotenv(self):
        # C8 回归防线（D7 加固）：覆盖 PowerShell 惯用落盘写法，并锚定硬约束块本体。
        content = _read(FIRECRAWL_SKILL_MD)
        self.assertNotRegex(
            content,
            r"firecrawl\s+env[^\n]*(?:>>?|\|\s*(?:Out-File|Set-Content|Add-Content|Tee-Object))[^\n]*\.env",
            "不应出现把 firecrawl env 输出落盘写入 .env 的指引（含 PowerShell 落盘动词）",
        )
        self.assertRegex(
            content,
            r"硬约束[\s\S]{0,500}?豁免仅覆盖\s*`?ANYSEARCH_API_KEY`?",
            "应保留明确声明『豁免仅覆盖 ANYSEARCH_API_KEY、不含 FIRECRAWL_API_KEY』的硬约束块",
        )

    def test_c10_skill_and_readme_contract_consistent(self):
        # C10：父 SKILL.md 与 README.md 对「脚本路径」「密钥位置」的描述必须一致
        skill, readme = _read(SKILL_MD), _read(README_MD)
        for name, text in (("SKILL.md", skill), ("README.md", readme)):
            self.assertIn(
                "anysearch-skill/scripts/anysearch_cli.py",
                text,
                f"{name} 应指向解耦后的脚本路径 anysearch-skill/scripts/anysearch_cli.py",
            )
        # 密钥位置：两份父文档都应指明父级 web-search/.env 持有 ANYSEARCH_API_KEY
        self.assertRegex(skill, r"\{SKILL_ROOT\}/\.env|父级\s*`?\.env`?", "SKILL.md 应说明密钥在父级 .env")
        self.assertRegex(readme, r"父级\s*`?\.env`?", "README.md 应说明密钥在父级 .env")
        # 两份父文档都必须显式声明 anysearch-skill 非独立 clone，且不得给出 git pull 升级指令
        for name, text in (("SKILL.md", skill), ("README.md", readme)):
            self.assertRegex(text, r"非独立\s*clone", f"{name} 应显式声明 anysearch-skill 为 vendored 纯副本、非独立 clone")
            self.assertNotRegex(text, r"git\s+-C\s+\S*anysearch\S*\s+pull", f"{name} 不应再给出 git pull 升级 anysearch-skill 的指令")
        # D2/D4（解耦版）：子技能 anysearch-skill/SKILL.md 必须是纯上游副本，
        # 不应含本仓库本地化 overlay（非独立 clone 声明 / 本地 uv 调用契约 / 父级 .env 引用）。
        sub = _read(ANYSEARCH_SKILL_MD)
        self.assertNotRegex(sub, r"非独立\s*clone", "anysearch-skill/SKILL.md 应为纯上游副本，不应含本仓库本地化 overlay 声明")
        self.assertNotRegex(sub, r"uv run --with requests python", "anysearch-skill/SKILL.md 不应含本地 uv 调用契约（属父层约定）")
        self.assertNotRegex(sub, r"web-search/\.env", "anysearch-skill/SKILL.md 不应引用父级 .env（密钥改由 orchestrate 注入）")
        self.assertNotRegex(sub, r"恢复独立 clone", "anysearch-skill/SKILL.md 不应推荐恢复独立 clone")
        # E2 护栏：三份文档一律不得出现指向 anysearch-skill 的 git clone / submodule 指令。
        for name, text in (("SKILL.md", skill), ("README.md", readme),
                           ("anysearch-skill/SKILL.md", sub)):
            self.assertNotRegex(
                text,
                GIT_CLONE_ANYSEARCH_RE,
                f"{name} 不应给出 git clone anysearch-skill 的可执行指令（会在父仓库内产生嵌套 .git）",
            )
            self.assertNotRegex(
                text,
                GIT_SUBMODULE_ANYSEARCH_RE,
                f"{name} 不应把 anysearch-skill 声明为 git submodule（与 vendored 纯副本契约冲突）",
            )

    def test_d8_env_lookup_stops_at_nearest(self):
        """D8 回归防线（解耦版）：上游 anysearch_cli.py 不得含父级 .env 三级探测补丁；
        orchestrate._load_parent_api_key 就近优先。

        (a) 解耦干净性：子脚本 _load_env 的探测列表不应出现祖父目录
            （script_dir, "..", ".."），即不再有「向上探测 web-search/.env」的本地补丁。
        (b) 密钥注入就近优先：_load_parent_api_key 命中 web-search/.env 即返回，
            不被其它目录静默覆盖。
        """
        content = _read(ANYSEARCH_CLI)
        # (a) 上游脚本不含祖父目录三级探测补丁
        self.assertNotIn(
            'script_dir, "..", ".."',
            content,
            "D8：解耦后 anysearch_cli.py 不应再含祖父目录三级探测补丁",
        )
        # (b) orchestrate._load_parent_api_key 能从 web-search/.env 解析（就近优先，仅一层父目录）
        key = orchestrate._load_parent_api_key(WEB_SEARCH)
        self.assertTrue(
            key,
            "D8：orchestrate._load_parent_api_key 应能从 web-search/.env 解析 ANYSEARCH_API_KEY",
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
        self.assertEqual(result.returncode, 0, f"firecrawl interact --help 应正常退出，实际 {result.returncode}")
        out = (result.stdout or "") + (result.stderr or "")
        self.assertRegex(out, r"(^|\s)(-p,\s*)?--prompt\b", "firecrawl interact 应支持 --prompt 选项")
        self.assertNotRegex(out, r"(^|\s)--task\b", "firecrawl interact 不应存在 --task 选项")


if __name__ == "__main__":
    unittest.main()
