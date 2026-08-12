#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_anysearch_upstream.py

ref-material-writing 上游自动跟进脚本（AnySearch 部分）。
追踪 anysearch-ai/anysearch-skill 上游演进，检测本地 vendored 副本是否落后。

设计原则：
- 自持：仅依赖标准库 + 本地 gh 命令行（D:/Tools/Assembly/gh.exe），不涉及 web-search。
- 只读检查，不修改任何文件，只报告差异。
- 本地锚定 commit 记录于下方 LOCAL_ANCHOR_SHA 常量；每次重新 vendored 升级后须同步更新此值
  以及 references/13-anysearch-integration.md 中的上游锚定声明。

用法：
  uv run --project "${REF_MATERIAL_UV_PROJECT:-D:/Tools/Assembly/python/myenv}" python scripts/check_anysearch_upstream.py
"""
import os
import subprocess
import sys

# gh 可执行文件路径：本机专属，默认回退到用户工具链目录；可经环境变量
# REF_MATERIAL_GH 覆盖，无需改脚本。
# gh 可执行文件路径：本机专属，默认回退到用户工具链目录；可经环境变量
# REF_MATERIAL_GH 覆盖，无需改脚本。_env_gh 用于区分「是否由用户显式设置」，
# 以便缺失时给出可读报错而非静默失败（见 F4 修复）。
_env_gh = os.environ.get("REF_MATERIAL_GH")
GH = _env_gh if _env_gh is not None else r"D:/Tools/Assembly/gh.exe"
UPSTREAM_REPO = "anysearch-ai/anysearch-skill"
# 本地 vendored 锚定的上游 commit（升级后须同步更新）。
# F8 修复：此为缩写 SHA 前缀（9 位 hex），仅作本地对齐锚点，碰撞概率极低，
# 不臆造不存在的完整 SHA。
LOCAL_ANCHOR_SHA = "69b3088fd"


def run_gh(args):
    try:
        r = subprocess.run(
            [GH] + args, capture_output=True, text=True, shell=False, timeout=60
        )
        if r.returncode != 0:
            return None, r.stderr.strip()
        return r.stdout, None
    except Exception as e:  # noqa: BLE001
        return None, str(e)


def main():
    # F4 修复：gh 路径为本机专属默认值；若非由环境变量显式设置且文件不存在，
    # 打印清晰报错并 exit(1)，避免后续 subprocess 静默失败、难以排错。
    if _env_gh is None and not os.path.isfile(GH):
        print(
            f"[ERROR] gh 可执行文件未找到：{GH}；"
            "请设置环境变量 REF_MATERIAL_GH 指向你的 gh.exe，"
            "或安装 gh 命令行工具后重试。",
            file=sys.stderr,
        )
        sys.exit(1)

    out, err = run_gh(
        [
            "api",
            f"repos/{UPSTREAM_REPO}/commits?per_page=1",
            "--jq",
            ".[0].sha, .[0].commit.author.date, .[0].commit.message",
        ]
    )
    if out is None:
        print(f"[ERROR] 无法获取上游信息：{err}")
        sys.exit(2)

    lines = out.strip().split("\n")
    latest_sha = lines[0].strip() if lines else ""
    latest_date = lines[1].strip() if len(lines) > 1 else "未知"
    latest_msg = lines[2].strip() if len(lines) > 2 else ""

    print(f"本地锚定 commit : {LOCAL_ANCHOR_SHA}")
    print(f"上游最新 commit : {latest_sha}")
    print(f"上游提交时间   : {latest_date}")
    if latest_msg:
        print(f"上游提交说明   : {latest_msg[:80]}")

    # F8 修复：比对前归一化（去空白、转小写），并取 latest_sha 前 N 位
    # （N = 锚点长度）做等长相等比较，消除「上游返回不同长度缩短 SHA 导致
    # startswith 误判对齐」的风险；不臆造完整 SHA。
    _latest_norm = latest_sha.strip().lower()
    _anchor_norm = LOCAL_ANCHOR_SHA.strip().lower()
    if _latest_norm and _latest_norm[: len(_anchor_norm)] == _anchor_norm:
        print("\n[OK] 本地 vendored 副本已对齐上游最新，无需更新。")
        sys.exit(0)
    else:
        print("\n[WARN] 检测到上游已有演进，本地 vendored 副本可能落后。")
        print("       建议：重新 vendored 升级 scripts/anysearch_cli.py 等三件套，")
        print("       并在 references/13 与本节 LOCAL_ANCHOR_SHA 同步更新锚定 commit。")
        sys.exit(1)


if __name__ == "__main__":
    main()
