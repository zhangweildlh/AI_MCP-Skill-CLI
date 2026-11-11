#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""wai-deploy-parity —— 部署态 ↔ main blob 三项判据校验 + AGENTS.md §7.2 复采值生成。

来源：外部工区一次性脚本 `_recapture_72.py`（硬编码 REPO / DEPLOY / SKILL_PATH，
每次 PR 后手工改路径才能用），按 AGENTS.md §7.3 与 §9 参数化回流为可复用回归测试。

口径（§7.2 / §7.3）：
  - 唯一权威内容 = <ref> 的 git blob（不经工作树，理由是内容权威性 / 避免未提交差异污染）；
  - 聚合 md5 = 按相对路径升序，逐文件序贯喂入 `相对路径 + \\0 + 文件字节`；
  - 三项判据：部署态逐字节 == blob、`hash-object --no-filters` == blob sha、CR = 0。

双模式（杜绝「部署态缺失 → 静默 SKIP」）：
  - 真实模式：`--deploy` 指定，或默认部署目录存在 → 校验真实部署态；
  - 自检模式：默认部署目录不存在 → 由 main blob 在临时目录合成一份「部署态副本」，
    跑同一套判据并输出复采值；绝不静默通过（D-17 静默失效从严）。

判据自身有效性（门禁铁律②③）：
  - 文件数下限、blob sha 形态、字节/行数非零；
  - 无论哪种模式，均在独立临时目录注入 1 字节腐坏，确认「逐字节」「hash-object」两项
    判据由 PASS 转 FAIL 后逐字节还原复验，给判据检出力留硬证据；不触碰真实部署态。

零硬编码：仓库根由 `__file__` 上溯 `.git` 推导，技能相对路径由相对位置推导，
部署目录由 `--deploy` 或 USERPROFILE 推导；不依赖当前工作目录。

运行（唯一入口调度见 scripts/smoke/test_manifest.py）：
  uv run python Workbuddy专属/wechat-article-to-ima/tests/test_deploy_parity.py
  uv run python .../test_deploy_parity.py --deploy <部署态绝对路径> --ref main --json
退出码：0 全过 / 1 判据失败 / 2 环境错误。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SKILL_REL = "Workbuddy专属/wechat-article-to-ima"
MIN_FILES = 20  # 判据自身有效性下限：ls-tree 返回 0 或异常少时立即怀疑判据本身
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def die(msg: str) -> int:
    print("[FATAL] " + msg, file=sys.stderr)
    return 2


def find_repo_root(start: Path):
    """上溯定位仓库根：主工作树为 .git 目录，worktree 为 .git 文件，两者都算。"""
    for p in [start] + list(start.parents):
        if (p / ".git").exists():
            return p
    return None


def git(repo: Path, args, binary=False):
    r = subprocess.run(["git", "-C", str(repo)] + [str(a) for a in args],
                       check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return r.stdout if binary else r.stdout.decode("utf-8", "replace").strip()


def ls_entries(repo: Path, ref: str, skill_rel: str):
    raw = git(repo, ["ls-tree", "-r", "-l", "-z", ref, "--", skill_rel], binary=True)
    out = []
    for rec in raw.split(b"\0"):
        if not rec:
            continue
        meta, _, name = rec.partition(b"\t")
        parts = meta.split()
        if len(parts) < 4:
            continue
        out.append((parts[2].decode("ascii"), int(parts[3]), name.decode("utf-8")))
    out.sort(key=lambda e: e[2])
    return out


def rel_of(full: str, skill_rel: str) -> str:
    prefix = skill_rel + "/"
    return full[len(prefix):] if full.startswith(prefix) else full


def check_one(repo: Path, deploy_root: Path, rel: str, blob: bytes, sha: str):
    """单项三项判据。返回 dict，缺失文件不算通过（不静默跳过）。"""
    p = deploy_root.joinpath(*rel.split("/"))
    if not p.is_file():
        return dict(exists=False, bytes_eq=False, sha_eq=False, cr_ok=False)
    disk = p.read_bytes()
    hs = git(repo, ["hash-object", "--no-filters", str(p)])
    return dict(exists=True, bytes_eq=(disk == blob), sha_eq=(hs == sha),
                cr_ok=(disk.count(b"\r") == 0))


def build_parser():
    ap = argparse.ArgumentParser(description="部署态一致性校验 + §7.2 复采（AGENTS.md §7.3）")
    ap.add_argument("--repo", default=None, help="仓库根绝对路径；缺省由脚本位置自动上溯 .git")
    ap.add_argument("--ref", default="main", help="git ref，默认 main")
    ap.add_argument("--skill-rel", default=None, dest="skill_rel",
                    help="技能在仓库内的相对路径；缺省由脚本位置自动推导")
    ap.add_argument("--deploy", default=None, help="部署态目录绝对路径；缺省取 USERPROFILE/.workbuddy/skills/wechat-article-to-ima")
    ap.add_argument("--json", action="store_true", dest="as_json", help="仅输出结构化 JSON")
    return ap


def main() -> int:
    opt = build_parser().parse_args()

    repo = Path(opt.repo).resolve() if opt.repo else find_repo_root(SKILL_DIR)
    if repo is None:
        return die("无法定位仓库根；请显式传 --repo <仓库根绝对路径>")
    if opt.skill_rel:
        skill_rel = opt.skill_rel.replace("\\", "/").strip("/")
    else:
        try:
            skill_rel = SKILL_DIR.relative_to(repo).as_posix()
        except ValueError:
            skill_rel = DEFAULT_SKILL_REL

    if opt.deploy:
        deploy = Path(opt.deploy).resolve()
        if not deploy.is_dir():
            return die("--deploy 指定目录不存在：" + str(deploy))
        mode = "real"
    else:
        home = os.environ.get("USERPROFILE") or str(Path.home())
        deploy = Path(home) / ".workbuddy" / "skills" / "wechat-article-to-ima"
        mode = "real" if deploy.is_dir() else "selfcheck"

    try:
        entries = ls_entries(repo, opt.ref, skill_rel)
    except subprocess.CalledProcessError as ex:
        return die("git ls-tree 失败（ref=%s / skill-rel=%s）：%s"
                   % (opt.ref, skill_rel, ex.stderr.decode("utf-8", "replace")[:200]))

    checks = []

    def ck(name, cond, detail=""):
        checks.append((name, bool(cond), str(detail)))
        return bool(cond)

    if not ck("判据自身有效：文件数 >= %d（防 ls-tree 失效）" % MIN_FILES,
              len(entries) >= MIN_FILES, "n=%d" % len(entries)):
        print("[FATAL] 文件数异常，判据本身可疑，拒绝继续", file=sys.stderr)
        return 1
    ck("判据自身有效：全部 blob sha 为 40 位 hex",
       all(SHA_RE.match(s) for s, _, _ in entries),
       "%d/%d" % (sum(1 for s, _, _ in entries if SHA_RE.match(s)), len(entries)))

    blobs, rels, per_file = [], [], []
    total_bytes = total_lines = total_cr = 0
    agg = hashlib.md5()
    try:
        for sha, size, full in entries:
            blob = git(repo, ["cat-file", "blob", sha], binary=True)
            rel = rel_of(full, skill_rel)
            blobs.append(blob)
            rels.append(rel)
            per_file.append((rel, sha, size))
            total_bytes += len(blob)
            total_lines += blob.count(b"\n")
            total_cr += blob.count(b"\r")
            agg.update(rel.encode("utf-8") + b"\0" + blob)
    except subprocess.CalledProcessError as ex:
        return die("git cat-file 失败：" + ex.stderr.decode("utf-8", "replace")[:200])

    ck("判据自身有效：总字节 / 总行数均 > 0", total_bytes > 0 and total_lines > 0,
       "bytes=%d lines=%d" % (total_bytes, total_lines))
    ck("入库 blob 恒 LF（CR 总数 = 0，§7.3）", total_cr == 0, "CR=%d" % total_cr)
    ck("聚合 md5 形态有效（32 位 hex）", len(agg.hexdigest()) == 32, agg.hexdigest())

    synth = None
    if mode == "selfcheck":
        # 部署态缺失：由 main blob 合成副本跑同一套判据，绝不静默 SKIP
        synth = Path(tempfile.mkdtemp(prefix="wai-parity-"))
        for (sha, _size, _full), rel, blob in zip(entries, rels, blobs):
            p = synth.joinpath(*rel.split("/"))
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(blob)
        target = synth
    else:
        target = deploy

    ok_bytes = ok_sha = ok_cr = 0
    try:
        for (sha, _size, _full), rel, blob in zip(entries, rels, blobs):
            r = check_one(repo, target, rel, blob, sha)
            ok_bytes += int(r["bytes_eq"])
            ok_sha += int(r["sha_eq"])
            ok_cr += int(r["cr_ok"])
    except subprocess.CalledProcessError as ex:
        return die("git hash-object 失败：" + ex.stderr.decode("utf-8", "replace")[:200])

    n = len(entries)
    ck("三项判据①：部署态逐字节 == blob（%d/%d）" % (ok_bytes, n), ok_bytes == n, "%d/%d" % (ok_bytes, n))
    ck("三项判据②：hash-object --no-filters == blob sha（%d/%d）" % (ok_sha, n), ok_sha == n, "%d/%d" % (ok_sha, n))
    ck("三项判据③：部署态 CR = 0（%d/%d）" % (ok_cr, n), ok_cr == n, "%d/%d" % (ok_cr, n))

    # 门禁铁律②：独立临时目录注入 1 字节腐坏 → 判据须由 PASS 转 FAIL → 逐字节还原复验。
    # 真实模式下也执行，但只碰临时目录，绝不改真实部署态。
    probe = Path(tempfile.mkdtemp(prefix="wai-parity-probe-"))
    try:
        rel0, blob0, sha0 = rels[0], blobs[0], entries[0][0]
        p0 = probe.joinpath(*rel0.split("/"))
        p0.parent.mkdir(parents=True, exist_ok=True)
        p0.write_bytes(blob0)
        before = check_one(repo, probe, rel0, blob0, sha0)
        orig_disk = p0.read_bytes()
        p0.write_bytes(orig_disk + b"X")
        after = check_one(repo, probe, rel0, blob0, sha0)
        p0.write_bytes(orig_disk)
        restored = check_one(repo, probe, rel0, blob0, sha0)
        ck("判据检出力反例：注入 1 字节后逐字节/sha 判据须双双转 FAIL",
           before["bytes_eq"] and before["sha_eq"] and before["cr_ok"]
           and (not after["bytes_eq"]) and (not after["sha_eq"]),
           "before=(%s,%s) after=(%s,%s)" % (before["bytes_eq"], before["sha_eq"],
                                             after["bytes_eq"], after["sha_eq"]))
        ck("判据检出力反例：逐字节还原后判据恢复全过",
           restored["bytes_eq"] and restored["sha_eq"] and restored["cr_ok"]
           and p0.read_bytes() == orig_disk)
    finally:
        shutil.rmtree(probe, ignore_errors=True)
        if synth is not None:
            shutil.rmtree(synth, ignore_errors=True)

    payload = dict(
        ref=opt.ref, repo=str(repo), skill_rel=skill_rel, mode=mode, deploy=str(deploy),
        files=n, total_bytes=total_bytes, total_lines=total_lines, total_cr=total_cr,
        aggregate_md5=agg.hexdigest(),
        parity=dict(bytes_eq=ok_bytes, hash_object_eq=ok_sha, cr_ok=ok_cr, expected=n),
        per_file=[dict(rel=r, blob_sha=s, size=z) for r, s, z in per_file],
        checks=[dict(name=x, ok=o, detail=d) for x, o, d in checks],
        passed=sum(1 for _, o, _ in checks if o),
        failed=sum(1 for _, o, _ in checks if not o),
    )

    if opt.as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("=== §7.2 复采值（ref=%s，模式=%s，口径 §7.3）===" % (opt.ref, mode))
        print("仓库根       =", repo)
        print("技能相对路径 =", skill_rel)
        print("部署态目录   =", deploy)
        if mode == "selfcheck":
            print("[SELF-CHECK] 部署态未提供/不存在 → 由 main blob 合成副本自检，非静默 SKIP")
        print("文件数       =", n)
        print("总字节       =", total_bytes)
        print("总行数(LF)   =", total_lines)
        print("CR 总数      =", total_cr)
        print("聚合 md5     =", agg.hexdigest())
        print("逐字节 == blob : %d / %d" % (ok_bytes, n))
        print("hash-object == blob sha : %d / %d" % (ok_sha, n))
        print("部署态 CR = 0  : %d / %d" % (ok_cr, n))
        print("--- 逐文件 blob sha（相对路径升序）---")
        for r, s, z in per_file:
            print("%s\t%s\t%d" % (r, s[:8], z))
        print("--- 判据明细 ---")
        for name, ok, detail in checks:
            print("  [%s] %s%s" % ("PASS" if ok else "FAIL", name,
                                   (" :: " + detail) if detail else ""))
        print("PASS=%d FAIL=%d" % (payload["passed"], payload["failed"]))

    return 0 if payload["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
