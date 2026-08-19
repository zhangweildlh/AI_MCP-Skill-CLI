#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_anysearch_upstream.py

ref-material-writing 上游跟进脚本（AnySearch 部分，blob 级校验）。
基于 vendored/anysearch-skill/MANIFEST.json 做内容指纹比对，判定：
  ① 上游是否更新了某文件（上游当前 blob ≠ MANIFEST.upstream_blob）；
  ② 本地补丁(overlay)是否完好（本地工作副本 blob = MANIFEST.patched_local_blob）。

设计原则：
- 自持：仅依赖标准库 + 本地 gh（PATH 探测，可用 REF_MATERIAL_GH 覆盖）+ git（PATH）。
- 只读检查，不修改任何文件。
- blob 级校验，消除旧版 commit 级软锚点（LOCAL_ANCHOR_SHA）的「假同步」误判。
- 上游纯净副本（父）存 vendored/anysearch-skill/，本地补丁（子）存 vendored/anysearch-skill/patches/。

用法：
  uv run --project "${REF_MATERIAL_UV_PROJECT:-D:/Tools/Assembly/python/myenv}" python scripts/check_anysearch_upstream.py
"""
import os
import sys
import json
import shutil
import subprocess

# gh 路径：优先 REF_MATERIAL_GH，否则 PATH 探测，最后回退 "gh"（去掉机器专属硬编码绝对路径）。
_env_gh = os.environ.get("REF_MATERIAL_GH")
GH = _env_gh if _env_gh else (shutil.which("gh") or "gh")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "vendored", "anysearch-skill", "MANIFEST.json"))
UPSTREAM_REPO = "anysearch-ai/anysearch-skill"


def run_gh(args):
    try:
        r = subprocess.run([GH] + args, capture_output=True, text=True, shell=False, timeout=60)
        if r.returncode != 0:
            return None, r.stderr.strip()
        return r.stdout, None
    except Exception as e:  # noqa: BLE001
        return None, str(e)


def git_blob(path):
    """返回文件的 git blob SHA（与 GitHub contents API 的 .sha 同构），失败返回 None。"""
    try:
        with open(path, "rb") as f:
            data = f.read()
        r = subprocess.run(["git", "hash-object", "--stdin"],
                           input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if r.returncode != 0:
            return None
        return r.stdout.decode().strip()
    except Exception:
        return None


def main():
    if not os.path.isfile(MANIFEST):
        print(f"[ERROR] 未找到 MANIFEST: {MANIFEST}")
        sys.exit(2)
    with open(MANIFEST, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    print("=" * 64)
    print("AnySearch 上游 blob 级校验（vendored/anysearch-skill）")
    print("=" * 64)
    print(f"上游仓库   : {manifest.get('upstream')}")
    print(f"锚定 commit : {manifest.get('anchor_commit')}")
    print(f"抓取时间   : {manifest.get('fetched_at')}")
    print()

    overall = "OK"        # OK=全一致; WARN=有真实差异需处理; UNKNOWN=上游状态不可达（不臆断更新）
    unknown_any = False
    for item in manifest.get("files", []):
        rel = item["rel"]
        upstream_blob = item.get("upstream_blob")
        patched_blob = item.get("patched_local_blob")
        patch = item.get("patch")

        # ① 上游当前 blob（经 gh api；失败则上游状态不可达，绝不臆断"有更新"）
        out, err = run_gh(["api", f"repos/{UPSTREAM_REPO}/contents/{rel}", "--jq", ".sha"])
        gh_ok = out is not None
        cur_up = (out or "").strip() if gh_ok else None

        # ② 本地工作副本 blob（scripts/<rel>）
        local_path = os.path.normpath(os.path.join(SCRIPT_DIR, "..", rel))
        cur_local = git_blob(local_path) if os.path.isfile(local_path) else None

        # 上游状态不可达：分流为独立态，不参与 upstream_moved 判定
        # （修复错误状态误判：gh 失败时 cur_up=None 曾使 upstream_moved 恒真，虚假报告"上游有更新"）
        if not gh_ok:
            upstream_unknown = True
            upstream_moved = False
            unknown_any = True
            status = "[HINT] 无法获取上游状态（gh 未认证 / 网络异常 / API 404），跳过上游更新判定"
        else:
            upstream_unknown = False
            upstream_moved = (cur_up != upstream_blob)
            if upstream_moved:
                status = "[WARN] 上游有更新 -> 建议重新 vendored 并视情况重放 patches/"
                overall = "WARN"
            elif cur_local == patched_blob:
                status = "[OK] 一致（补丁完好）"
            else:
                status = "[WARN] 本地补丁漂移（工作副本被意外改动）"
                overall = "WARN"

        print(f"[{rel}]")
        print(f"  上游: manifest={str(upstream_blob)[:12]}  current={str(cur_up or '?')[:12]}"
              + ("  (状态不可达)" if upstream_unknown else ""))
        print(f"  本地: manifest={str(patched_blob)[:12]}  current={str(cur_local or '?')[:12]}  patch={patch}")
        print(f"  状态: {status}")
        print()

    if overall == "WARN":
        print("[WARN] 检测到真实差异，需处理：")
        print("   - 上游有更新：gh api 拉取新纯净副本覆盖 vendored/.../ 对应文件，")
        print("     再 `git apply vendored/anysearch-skill/patches/<file>.patch` 重放本地补丁，")
        print("     最后更新 MANIFEST.json 的 upstream_blob / patched_local_blob。")
        print("   - 本地补丁漂移：核对 scripts/<rel> 是否被意外改动，必要时从补丁重建。")
        sys.exit(1)
    elif unknown_any:
        print("[HINT] 上游状态不可达（gh 认证 / 网络 / API 异常），未能完成上游更新判定；")
        print("      本地补丁完好性已校验。请检查 gh 登录态后重跑以确认上游是否更新。")
        sys.exit(2)
    else:
        print("[OK] 所有 vendored 文件均与 MANIFEST 一致，补丁完好；上游无更新。")
        sys.exit(0)


if __name__ == "__main__":
    main()
