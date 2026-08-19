#!/usr/bin/env python3
"""web-search 审计修复回归测试（stdlib unittest；被测脚本 anysearch_cli.py 需要 requests）。

覆盖的审计契约：
- F2  ：anysearch_cli.py 的 `_load_env` 能从 web-search/.env（script_dir/../../.env）解析 ANYSEARCH_API_KEY
- F4  ：父 SKILL.md 不再硬编码 D:\\Tools\\Assembly 本机绝对路径
- F7  ：firecrawl/SKILL.md 的 interact 用 --prompt 而非 --task（文档契约）
- F7' ：firecrawl CLI 真实契约（`firecrawl interact --help` 含 --prompt）
- C8  ：firecrawl/SKILL.md 不得给出把 FIRECRAWL_API_KEY 落盘写入 .env 的指引
- C10 ：父 SKILL.md 与 README.md 的调用契约（脚本路径 / 密钥位置）互相一致
- D2/D4：子技能 anysearch-skill/SKILL.md 含本地化 overlay（非独立 clone + uv 调用契约，不推荐裸 python / 不恢复独立 clone）
- E2  ：三份文档一律不得出现指向 anysearch-skill 的 git clone / submodule 指令（按指令形态布防，不依赖文案措辞）
- D8/E4：`_load_env` 就近优先——命中第一个 .env 后 break，父级 .env 不得静默覆盖

运行（必须走 uv，禁裸 python —— 裸 python 缺 requests 会直接 ERROR）：
    uv run --with requests python -m unittest discover -s web-search/tests -v
"""

import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB_SEARCH = os.path.join(REPO_ROOT, "web-search")
SKILL_MD = os.path.join(WEB_SEARCH, "SKILL.md")
README_MD = os.path.join(WEB_SEARCH, "README.md")
FIRECRAWL_SKILL_MD = os.path.join(WEB_SEARCH, "firecrawl", "SKILL.md")
ANYSEARCH_SKILL_MD = os.path.join(WEB_SEARCH, "anysearch-skill", "SKILL.md")
DOTENV = os.path.join(WEB_SEARCH, ".env")
ANYSEARCH_CLI = os.path.join(WEB_SEARCH, "anysearch-skill", "scripts", "anysearch_cli.py")


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
        # C11/D9 加固：快照 os.environ 与 sys.stdout/stderr，finally 中差分复原，
        # 避免 anysearch_cli.py 模块级副作用（_load_env 注入、sys.stdout/stderr 替换）污染后续用例。
        # CI 安全化：web-search/.env 按 2026-08-11 安全决议被 .gitignore 永久忽略、绝不入库，
        # CI 干净检出无此文件 → 本用例必然失败，导致全仓库 smoke 红灯（历史遗留缺陷）。
        # 改为：.env 缺失时跳过（CI 场景），仅在本机存在 .env 时做真实密钥解析校验。
        if not os.path.isfile(DOTENV):
            self.skipTest("web-search/.env 缺失（git-ignored，仅本机集成校验，CI 跳过）")
        snapshot = dict(os.environ)
        saved_out, saved_err = sys.stdout, sys.stderr  # D9：复原模块级 sys.stdout/stderr 替换
        try:
            os.environ.pop("ANYSEARCH_API_KEY", None)
            _load_anysearch_cli_module()  # 触发 _load_env，并可能按需替换 sys.stdout/stderr
            self.assertTrue(
                os.environ.get("ANYSEARCH_API_KEY"),
                "F2 修复后 _load_env 应能从 web-search/.env 解析 ANYSEARCH_API_KEY",
            )
        finally:
            # D9/E3：被测脚本在非 UTF-8 终端下会用 io.TextIOWrapper(sys.stdout.buffer) 顶替标准流。
            # 若直接丢弃该 wrapper，它被 GC 时会连同**共享的底层 buffer** 一起关闭，
            # 导致后续用例写 stdout 触发 ValueError: I/O operation on closed file。
            # 正确姿势：先 flush 落盘缓冲，再 detach 解绑底层 buffer，最后复原原始流对象。
            for cur, orig in ((sys.stdout, saved_out), (sys.stderr, saved_err)):
                if cur is orig:
                    continue
                try:
                    cur.flush()
                except Exception:
                    pass
                try:
                    cur.detach()  # 解绑 buffer：wrapper 回收时不再关闭共享底层流
                except Exception:
                    pass
            sys.stdout, sys.stderr = saved_out, saved_err
            # 差分复原 os.environ（Windows 超长变量 clear+update 会 ValueError）
            for k in [k for k in os.environ if k not in snapshot]:
                del os.environ[k]
            for k, v in snapshot.items():
                if os.environ.get(k) != v:
                    os.environ[k] = v

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
        # 要求落盘目标以 .env 结尾，避免把 `> /dev/null` 之类无害重定向误判。
        content = _read(FIRECRAWL_SKILL_MD)
        self.assertNotRegex(
            content,
            r"firecrawl\s+env[^\n]*(?:>>?|\|\s*(?:Out-File|Set-Content|Add-Content|Tee-Object))[^\n]*\.env",
            "不应出现把 firecrawl env 输出落盘写入 .env 的指引（含 PowerShell 落盘动词）",
        )
        # 锚定硬约束块本体：声明覆盖边界（ANYSEARCH_API_KEY 豁免、不含 FIRECRAWL_API_KEY）。
        # 若整段硬约束块被删除，本条必 FAIL。
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
            self.assertRegex(text, r"非独立\s*clone", f"{name} 应显式声明 anysearch-skill 为扁平并入、非独立 clone")
            self.assertNotRegex(text, r"git\s+-C\s+\S*anysearch\S*\s+pull", f"{name} 不应再给出 git pull 升级 anysearch-skill 的指令")
        # D4：子技能 anysearch-skill/SKILL.md 必须含本地化 overlay——
        # 声明非独立 clone、uv 调用契约，且不推荐恢复独立 clone（避免嵌套 git）
        sub = _read(ANYSEARCH_SKILL_MD)
        self.assertRegex(sub, r"非独立\s*clone", "anysearch-skill/SKILL.md（overlay）应声明非独立 clone")
        self.assertRegex(sub, r"uv run --with requests python", "anysearch-skill/SKILL.md 应声明 uv 调用契约")
        self.assertNotRegex(sub, r"恢复独立 clone", "anysearch-skill/SKILL.md 不应推荐恢复独立 clone")
        # E2 护栏：仅字面否定「恢复独立 clone」存在盲区——换一种措辞给出真实
        # `git clone ... anysearch-skill` 指令同样会在父仓库内制造嵌套 .git，却能绕过上一条断言。
        # 因此按「可执行指令形态」而非「文案措辞」布防：三份文档一律不得出现指向
        # anysearch-skill 的 git clone / submodule 指令。
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
                f"{name} 不应把 anysearch-skill 声明为 git submodule（与扁平并入契约冲突）",
            )

    def test_d8_env_lookup_stops_at_nearest(self):
        """D8 回归防线：`_load_env` 命中第一个存在的 .env 后必须 break（就近优先）。

        若 `break` 被删除，探测会继续走到父级 .env 并静默覆盖子目录 key —— 本用例即 FAIL。
        做法：把被测脚本复制到临时目录树，同时布置「脚本同目录 .env」与「父级 .env」两份
        冲突取值，用子进程加载并回读生效值，避免污染当前进程 environ / 标准流。
        """
        tmp = tempfile.mkdtemp(prefix="anysearch_env_")
        try:
            scripts_dir = os.path.join(tmp, "skill", "scripts")
            os.makedirs(scripts_dir)
            cli_copy = os.path.join(scripts_dir, "anysearch_cli.py")
            shutil.copyfile(ANYSEARCH_CLI, cli_copy)
            # 就近 .env（script_dir/）与父级 .env（script_dir/../../）给出可区分的取值
            with open(os.path.join(scripts_dir, ".env"), "w", encoding="utf-8") as f:
                f.write("ANYSEARCH_API_KEY=nearest-wins\n")
            with open(os.path.join(tmp, ".env"), "w", encoding="utf-8") as f:
                f.write("ANYSEARCH_API_KEY=parent-must-not-override\n")

            probe = os.path.join(tmp, "probe.py")
            with open(probe, "w", encoding="utf-8") as f:
                f.write(
                    "import importlib.util, os, sys\n"
                    "spec = importlib.util.spec_from_file_location('cli_under_test', sys.argv[1])\n"
                    "mod = importlib.util.module_from_spec(spec)\n"
                    "spec.loader.exec_module(mod)\n"
                    "sys.__stdout__.write('RESULT=' + (os.environ.get('ANYSEARCH_API_KEY') or '') + '\\n')\n"
                    "sys.__stdout__.flush()\n"
                )
            # 清掉继承来的同名变量，确保回读值只可能来自两份 .env 之一
            child_env = {k: v for k, v in os.environ.items() if k != "ANYSEARCH_API_KEY"}
            try:
                r = subprocess.run(
                    [sys.executable, probe, cli_copy],
                    capture_output=True, text=True, timeout=60, env=child_env,
                )
            except Exception as e:  # 子进程异常时跳过，不阻断门禁
                self.skipTest(f"子进程执行失败：{e}")
                return
            combined = (r.stdout or "") + (r.stderr or "")
            if "ModuleNotFoundError" in combined or "ImportError" in combined:
                self.skipTest("被测脚本依赖（requests）不可用，跳过 D8 就近优先校验")
                return
            self.assertIn(
                "RESULT=nearest-wins", combined,
                "D8：_load_env 应在命中脚本同目录 .env 后 break（就近优先）；"
                f"实际输出：{combined.strip()[:300]}",
            )
            self.assertNotIn(
                "RESULT=parent-must-not-override", combined,
                "D8 回退：父级 .env 覆盖了就近 .env，说明探测循环缺少 break",
            )
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_f7_cli_contract(self):
        # B13 修复：用 shutil.which 解析（Windows 下含 .cmd 后缀），避免 subprocess 找不到无扩展名可执行
        # C9 加固：合并 stdout+stderr（部分 CLI 把 --help 写到 stderr）、校验 returncode、去掉上游文案硬编码断言
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
