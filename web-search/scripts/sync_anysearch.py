#!/usr/bin/env python3
"""web-search 上游一键 vendoring 脚本（标准库 + subprocess，best-effort）。

把上游 `anysearch-ai/anysearch-skill` 的 ALLOWLIST 文件拉取并覆盖到本地
`web-search/anysearch-skill/`，使 vendored 副本与上游逐字一致；随后清理
HARD_EXCLUDES（.github/、.gitignore），并写回 `.upstream_version` 基线。

设计原则：
  * 解耦核心：`anysearch-skill/` 是纯上游副本、零本地补丁。任何本地化改动都不应
    出现在 vendored 副本内；密钥注入等本地逻辑由父层 `orchestrate.py` 负责。
  * 幂等：多次运行结果一致；只覆盖 ALLOWLIST，绝不误删 vendored 副本外的任何文件。
  * 安全：`--dry-run` 仅打印将执行的动作，不写盘、不删盘。
  * 可审计：每步失败均打印原因并继续（单文件失败不影响其余），最终汇总。

用法：
    python scripts/sync_anysearch.py [--dry-run] [--ref main]
"""
from __future__ import annotations

import argparse
import base64
import datetime as _dt
import json
import os
import shutil
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_SEARCH_DIR = os.path.dirname(SCRIPT_DIR)
ANYSEARCH_DIR = os.path.join(WEB_SEARCH_DIR, "anysearch-skill")
# 单一常量源：从 vendoring 共享配置导入，避免与 check_upstream_drift 双份硬编码
# （审计 finding M1）。文件级直接运行时 SCRIPT_DIR 常在 sys.path[0]；
# 若以 importlib 加载导致同目录不在检索路径，则显式注入后导入。
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
from vendoring_config import ALLOWLIST, UPSTREAM_REPO, DEFAULT_REF

# vendored 副本中刻意排除的上游内容（同步后主动删除）
HARD_EXCLUDES = [
    os.path.join(ANYSEARCH_DIR, ".github"),
    os.path.join(ANYSEARCH_DIR, ".gitignore"),
]

VERSION_FILE = os.path.join(ANYSEARCH_DIR, ".upstream_version")


# --------------------------------------------------------------------------- #
# gh api helpers
# --------------------------------------------------------------------------- #
def _gh_api_json(api_path, subprocess_run):
    cmd = ["gh", "api", api_path]
    run = subprocess_run or subprocess.run
    proc = run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "gh api non-zero rc=%s: %s" % (proc.returncode, (proc.stderr or "").strip()[:300])
        )
    return json.loads(proc.stdout)


def _decode_base64(content_b64):
    if not content_b64:
        return None
    cleaned = content_b64.replace("\n", "").replace("\r", "").replace(" ", "")
    try:
        return base64.b64decode(cleaned)
    except (ValueError, TypeError):
        return None


def _fetch_upstream_file(rel_path, ref, subprocess_run):
    """拉取 upstream 单文件内容（bytes）或 None。"""
    api = "repos/%s/contents/%s?ref=%s" % (UPSTREAM_REPO, rel_path, ref)
    try:
        data = _gh_api_json(api, subprocess_run)
    except Exception as e:
        print("  [跳过] 拉取 %s 失败：%s" % (rel_path, e))
        return None
    raw = _decode_base64(data.get("content"))
    if raw is None:
        print("  [跳过] %s 内容解码失败（可能上游路径变更）" % rel_path)
        return None
    return raw


def _fetch_upstream_version(ref, subprocess_run):
    """从上游 SKILL.md 的 `version:` 字段与最新 commit 取版本信息。"""
    version = None
    try:
        data = _gh_api_json(
            "repos/%s/contents/SKILL.md?ref=%s" % (UPSTREAM_REPO, ref), subprocess_run
        )
        raw = _decode_base64(data.get("content"))
        if raw:
            for line in raw.decode("utf-8", "replace").splitlines():
                if line.startswith("version:"):
                    version = line.split(":", 1)[1].strip()
                    break
    except Exception:
        pass

    commit = None
    try:
        commits = _gh_api_json(
            "repos/%s/commits?sha=%s&per_page=1" % (UPSTREAM_REPO, ref), subprocess_run
        )
        if isinstance(commits, list) and commits:
            commit = commits[0].get("sha")
    except Exception:
        pass
    return version, commit


# --------------------------------------------------------------------------- #
# 同步动作
# --------------------------------------------------------------------------- #
def _plan(ref, subprocess_run):
    """计算将要写入/删除的动作清单（不落盘）。"""
    writes = []  # (rel_path, content_bytes)
    for rel in ALLOWLIST:
        raw = _fetch_upstream_file(rel, ref, subprocess_run)
        if raw is None:
            continue
        writes.append((rel, raw))
    deletes = [p for p in HARD_EXCLUDES if os.path.exists(p)]
    version, commit = _fetch_upstream_version(ref, subprocess_run)
    return writes, deletes, version, commit


def _apply(writes, deletes, ref, version, commit, dry_run, subprocess_run):
    failures = []
    for rel, raw in writes:
        dest = os.path.join(ANYSEARCH_DIR, rel)
        if dry_run:
            print("  [dry-run] 将写入 %s (%d 字节)" % (rel, len(raw)))
        else:
            try:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "wb") as f:
                    f.write(raw)
                print("  [ok] 写入 %s" % rel)
            except OSError as e:
                failures.append((rel, str(e)))
                print("  [失败] 写入 %s：%s" % (rel, e))

    for p in deletes:
        if dry_run:
            print("  [dry-run] 将删除 %s" % p)
        else:
            try:
                if os.path.isdir(p):
                    shutil.rmtree(p, ignore_errors=True)
                else:
                    os.remove(p)
                print("  [ok] 删除 %s" % p)
            except OSError as e:
                failures.append((p, str(e)))
                print("  [失败] 删除 %s：%s" % (p, e))

    if not dry_run:
        meta = {
            "ref": ref,
            "version": version or "unknown",
            "commit": commit or "unknown",
            "updated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        }
        try:
            with open(VERSION_FILE, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, sort_keys=True)
                f.write("\n")
            print("  [ok] 写回 .upstream_version (version=%s commit=%s)"
                  % (meta["version"], meta["commit"][:8]))
        except OSError as e:
            failures.append((VERSION_FILE, str(e)))
            print("  [失败] 写回 .upstream_version：%s" % e)
    else:
        print("  [dry-run] 将写回 .upstream_version (version=%s commit=%s)"
              % (version or "unknown", (commit or "unknown")[:8]))

    return failures


def main(argv=None, subprocess_run=None):
    parser = argparse.ArgumentParser(
        description="web-search 上游 anysearch-skill 一键 vendoring（best-effort）"
    )
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不写盘/删盘")
    parser.add_argument("--ref", default=DEFAULT_REF, help="上游分支/commit（默认 %(default)s）")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    print("=" * 60)
    print("web-search 上游 vendoring：%s @ %s" % (UPSTREAM_REPO, args.ref))
    print("  目标目录：%s" % ANYSEARCH_DIR)
    print("  dry-run  ：%s" % ("是" if args.dry_run else "否"))
    print("=" * 60)

    writes, deletes, version, commit = _plan(args.ref, subprocess_run)
    print("计划：写入 %d 个文件，删除 %d 项，版本=%s commit=%s"
          % (len(writes), len(deletes), version or "未知", (commit or "未知")[:8]))
    failures = _apply(writes, deletes, args.ref, version, commit, args.dry_run, subprocess_run)

    print("=" * 60)
    if failures:
        print("结论：完成，但有 %d 项失败，请检查上方 [失败] 条目。" % len(failures))
        for path, err in failures:
            print("  - %s: %s" % (path, err))
        sys.exit(2)
    print("结论：同步完成（%s）。" % ("dry-run 预览" if args.dry_run else "已写盘"))
    if not args.dry_run:
        print("建议随后运行：`python scripts/check_upstream_drift.py` 验证一致性。")
    sys.exit(0)


if __name__ == "__main__":
    main()
