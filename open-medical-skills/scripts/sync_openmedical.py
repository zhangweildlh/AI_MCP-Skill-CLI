#!/usr/bin/env python3
"""open-medical-skills 上游 vendoring 同步脚本（标准库 + subprocess，best-effort）。

把上游 Open-Medica/open-medical-skills 的四个原生子技能，作为「与上游逐字一致、
零本地补丁」的 vendored 副本，文件级同步到本包顶层同名子目录（进 git，离线可用）。

设计原则（对齐 web-search/vendoring）：
  * 解耦核心：四个子技能目录是纯上游副本、零本地补丁。任何本地化改动都在父
    SKILL.md，绝不应出现在 vendored 副本内。
  * 单一事实源：子技能清单与上游地址来自 config.json（native_skills / upstream.*），
    不与脚本双份硬编码。
  * 幂等：多次运行结果一致；只覆盖 ALLOWLIST 文件，绝不误删 vendored 副本外的文件。
  * 安全：--dry-run 仅打印将执行的动作，不写盘、不删盘。
  * 可审计：失败打印原因并继续，最终汇总。

用法：
    python scripts/sync_openmedical.py [--dry-run] [--check-drift]
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PKG_DIR = os.path.dirname(SCRIPT_DIR)
CONFIG_PATH = os.path.join(PKG_DIR, "config.json")
UPSTREAM_DIR = os.path.join(PKG_DIR, "upstream")
GIT = os.environ.get("GIT_BIN", "git")


def log(m):
    print("[open-medical-skills][sync] %s" % m)


def die(m):
    print("[open-medical-skills][sync][错误] %s" % m, file=sys.stderr)
    sys.exit(1)


def load_config():
    if not os.path.exists(CONFIG_PATH):
        die("未找到 config.json：%s" % CONFIG_PATH)
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        die("config.json 解析失败：%s" % e)


def _git(args, cwd):
    try:
        return subprocess.run([GIT] + args, cwd=cwd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            "git %s 失败：%s" % (" ".join(args), (e.stderr or "").strip()[:300])
        )
    except FileNotFoundError:
        raise RuntimeError("未找到 git 命令（请确认在 PATH 或用 GIT_BIN 指定）")


def ensure_upstream(cfg, dry_run):
    """确保 upstream/ 缓存为最新（best-effort）。"""
    repo = (cfg.get("upstream") or {}).get("repo")
    branch = (cfg.get("upstream") or {}).get("branch") or "main"
    if not repo:
        die("config.json 缺少 upstream.repo")
    if os.path.exists(os.path.join(UPSTREAM_DIR, ".git")):
        log("上游缓存已存在，拉取最新（分支 %s）…" % branch)
        if not dry_run:
            _git(["fetch", "--depth", "1", "origin", branch], UPSTREAM_DIR)
            _git(["reset", "--hard", "origin/%s" % branch], UPSTREAM_DIR)
    else:
        log("首次克隆上游 %s（分支 %s）…" % (repo, branch))
        if not dry_run:
            _git(["clone", "--depth", "1", "--branch", branch, repo, UPSTREAM_DIR], None)


def _upstream_commit():
    try:
        r = subprocess.run([GIT, "-C", UPSTREAM_DIR, "rev-parse", "HEAD"],
                            capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout.strip()
    except Exception:
        pass
    return "unknown"


def copy_vendored(cfg, dry_run):
    """文件级复制四子技能到顶层 vendored 目录，并写版本标记。"""
    skills_subdir = (cfg.get("upstream") or {}).get("skills_subdir") or "skills"
    skills = cfg.get("native_skills") or []
    if not skills:
        die("config.json 缺少 native_skills")
    branch = (cfg.get("upstream") or {}).get("branch") or "main"
    commit = _upstream_commit()
    failures = []
    for name in skills:
        src = os.path.join(UPSTREAM_DIR, skills_subdir, name, "SKILL.md")
        dst_dir = os.path.join(PKG_DIR, name)
        dst = os.path.join(dst_dir, "SKILL.md")
        if not os.path.exists(src):
            print("  [跳过] 上游缺失 %s（可能上游已更名）" % src)
            continue
        if dry_run:
            print("  [dry-run] 将写入 %s" % dst)
        else:
            try:
                os.makedirs(dst_dir, exist_ok=True)
                with open(src, "rb") as f:
                    data = f.read()
                with open(dst, "wb") as f:
                    f.write(data)
                print("  [ok] 写入 %s" % dst)
            except OSError as e:
                failures.append((dst, str(e)))
                print("  [失败] 写入 %s：%s" % (dst, e))
        version_path = os.path.join(dst_dir, ".upstream_version")
        meta = {
            "ref": branch,
            "commit": commit,
            "updated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        }
        if not dry_run:
            try:
                with open(version_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, indent=2, sort_keys=True)
                    f.write("\n")
            except OSError as e:
                failures.append((version_path, str(e)))
                print("  [失败] 写版本 %s：%s" % (version_path, e))
    return failures


def check_drift(cfg):
    """比对本地 vendored 副本与 upstream 缓存的 sha256（best-effort）。"""
    skills_subdir = (cfg.get("upstream") or {}).get("skills_subdir") or "skills"
    skills = cfg.get("native_skills") or []
    has_drift = False
    print("=" * 56)
    print("上游漂移检测（本地 vendored vs upstream 缓存）")
    print("=" * 56)
    for name in skills:
        src = os.path.join(UPSTREAM_DIR, skills_subdir, name, "SKILL.md")
        dst = os.path.join(PKG_DIR, name, "SKILL.md")
        if not os.path.exists(src) or not os.path.exists(dst):
            print("  [未知] %s（本地或上游缺失）" % name)
            continue
        with open(src, "rb") as f:
            h1 = hashlib.sha256(f.read()).hexdigest()
        with open(dst, "rb") as f:
            h2 = hashlib.sha256(f.read()).hexdigest()
        if h1 == h2:
            print("  [OK  ] %s" % name)
        else:
            has_drift = True
            print("  [DRIFT] %s" % name)
    print("=" * 56)
    if has_drift:
        print("结论：检测到漂移，请运行同步脚本跟进上游。")
        return 1
    print("结论：无漂移（本地 vendored 与 upstream 缓存一致）。")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="open-medical-skills 上游 vendoring 同步")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不写盘")
    parser.add_argument("--check-drift", action="store_true", help="仅做漂移检测，不写盘")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    cfg = load_config()
    if args.check_drift:
        sys.exit(check_drift(cfg))

    print("=" * 60)
    print("open-medical-skills 上游同步")
    print("  dry-run：%s" % ("是" if args.dry_run else "否"))
    print("=" * 60)
    ensure_upstream(cfg, args.dry_run)
    failures = copy_vendored(cfg, args.dry_run)
    print("=" * 60)
    if failures:
        print("完成，但有 %d 项失败：" % len(failures))
        for p, e in failures:
            print("  - %s: %s" % (p, e))
        sys.exit(2)
    print("同步完成（%s）。" % ("dry-run 预览" if args.dry_run else "已写盘"))
    if not args.dry_run:
        print("建议随后运行：python scripts/sync_openmedical.py --check-drift 验证一致性。")
    sys.exit(0)


if __name__ == "__main__":
    main()
