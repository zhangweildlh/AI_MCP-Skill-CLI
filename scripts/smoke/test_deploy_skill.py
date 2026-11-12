#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""仓库级唯一同步器 scripts/deploy-skill.cjs 的离线回归测试。

覆盖（AGENTS.md §9.6 测试资产纪律）：
  1. §7.2 注册表解析完整性（唯一事实源，脚本内零硬编码映射）
  2. 单文件型 name 与部署态目录名一致性（§7.6 判据）
  3. --dry-run 零写盘
  4. 真实同步 + §7.3 三项判据（逐字节 == blob / hash-object == blob sha / CR=0）
  5. 反向测试：注入 1 字节腐坏后 --verify 必须报错（证明判据确有检出力）
  6. --exclude 生效、未知技能拒绝、--help 可用
测试全程只写 tempfile 临时目录，不触碰真实部署态；临时目录由上下文自动清理。
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO / "scripts" / "deploy-skill.cjs"
NODE = "node"

CHECKS: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    CHECKS.append((name, bool(cond), detail))
    print(("  [PASS] " if cond else "  [FAIL] ") + name + ((" | " + detail) if detail else ""))


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [NODE, str(SCRIPT), *args], cwd=str(REPO),
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def git(*args: str) -> bytes:
    return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, check=True).stdout


def main() -> int:
    print("=== deploy-skill.cjs 离线回归 ===")

    # 1) 注册表解析
    r = run("--list")
    rows = []
    if r.returncode == 0:
        try:
            rows = json.loads(r.stdout)
        except json.JSONDecodeError as e:
            check("注册表 --list 输出为合法 JSON", False, str(e))
    else:
        check("注册表 --list 可执行", False, r.stderr.strip()[:200])
    check("注册表已部署条目 >= 20", len(rows) >= 20, f"实际 {len(rows)}")
    check("条目字段完整（name/devPath/deployDir/layout）",
          all(all(k in x for k in ("name", "devPath", "deployDir", "layout")) for x in rows))
    singles = [x for x in rows if x["layout"] == "single"]
    check("存在单文件型条目（形态转换被覆盖）", len(singles) >= 4, f"实际 {len(singles)}")
    check("单文件型部署态列以 SKILL.md 结尾",
          all(x["deployDir"].endswith("/SKILL.md") for x in singles))
    check("单文件型 name == 部署态目录名",
          all(x["name"] == Path(x["deployDir"]).parent.name for x in singles))
    check("已移除条目（self-improvement）未被同步器纳入",
          all(x["name"] != "self-improvement" for x in rows))

    # 2) --help 与未知技能拒绝
    check("--help 可执行", run("--help").returncode == 0)
    bad = run("--skill", "__not_registered__", "--dry-run")
    check("未登记技能被拒绝", bad.returncode != 0, bad.stderr.strip()[:120])

    # 3) --dry-run 零写盘 + --exclude 生效
    with tempfile.TemporaryDirectory(prefix="deploy-skill-test-") as td:
        root = Path(td)
        dry = run("--skill", "skill-forge", "--dry-run", "--to", str(root))
        check("单文件型 --dry-run 可执行", dry.returncode == 0, dry.stderr.strip()[:120])
        check("预演零写盘", not any(root.iterdir()))

        sync = run("--skill", "skill-forge", "--to", str(root), "--ref", "main", "--json")
        check("真实同步可执行", sync.returncode == 0, sync.stderr.strip()[:200])
        summary = {}
        if sync.returncode == 0:
            try:
                summary = json.loads(sync.stdout)
            except json.JSONDecodeError as e:
                check("同步 --json 输出为合法 JSON", False, str(e))
        check("三项判据全过（verifyBad=0）", summary.get("verifyBad") == 0, f"实际 {summary.get('verifyBad')}")
        item = (summary.get("items") or [{}])[0]
        check("逐字节 == blob", item.get("verify", {}).get("byteEqual") == item.get("files"))
        check("hash-object == blob sha", item.get("verify", {}).get("shaEqual") == item.get("files"))
        check("CR = 0", item.get("verify", {}).get("crZero") == item.get("files"))

        dest = root / "skill-forge" / "SKILL.md"
        blob = git("cat-file", "blob", "main:Skill-元技能，Skill创建校验器.md")
        check("落盘内容逐字节 == main blob", dest.exists() and dest.read_bytes() == blob)

        # 4) 反向测试：注入 1 字节腐坏，--verify 必须报错
        original = dest.read_bytes()
        dest.write_bytes(original + b"\x00")
        verify = run("--skill", "skill-forge", "--to", str(root), "--ref", "main", "--verify")
        check("注入缺陷后 --verify 如期失败", verify.returncode != 0,
              f"exit={verify.returncode}")
        check("失败输出含判据证据", "校验不一致" in (verify.stdout + verify.stderr))
        dest.write_bytes(original)  # 逐字节还原
        check("还原后 --verify 恢复通过",
              run("--skill", "skill-forge", "--to", str(root), "--ref", "main", "--verify").returncode == 0)

    # 5) --exclude 生效（集中兜底配置 + 命令行叠加）
    base = run("--skill", "wechat-article-to-ima", "--dry-run", "--to",
               str(Path(tempfile.gettempdir()) / "deploy-skill-plan"))
    excl = run("--skill", "wechat-article-to-ima", "--dry-run", "--exclude", "tests/", "--to",
               str(Path(tempfile.gettempdir()) / "deploy-skill-plan"))
    check("--exclude 预演可执行", base.returncode == 0 and excl.returncode == 0)
    check("--exclude 确实减少待同步文件数",
          excl.stdout.count("  → ") < base.stdout.count("  → "),
          f"base={base.stdout.count('  → ')} excl={excl.stdout.count('  → ')}")

    failed = [n for n, ok, _ in CHECKS if not ok]
    print(f"\n结果：{len(CHECKS) - len(failed)}/{len(CHECKS)} 通过")
    if failed:
        print("失败项：" + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
