#!/usr/bin/env python3
"""上游漂移检测脚本（标准库 + subprocess，best-effort）。

为 web-search 技能依赖的两个上游提供「自动漂移基线」，让陌生 Agent 无需手动维护
README 里的同步记录表即可判断上游是否漂移：

  * anysearch-skill/scripts/anysearch_cli.py
        —— 比对本地文件的 sha256 与 GitHub contents API 解码 content 后的 sha256
  * firecrawl apps/api/openapi.json
        —— 比对本地记录的 Git blob sha（.upstream_sha.json 的 firecrawl_openapi_sha 键）
           与上游 contents API 响应里的 `sha` 字段（Git blob sha）

设计原则（best-effort，绝不让 CI 因无网络而硬失败）：
  * gh 缺失（FileNotFoundError）/ 网络错误 / API 非零返回 / JSON 解析失败 / 本地文件缺失
    —— 一律 status="unknown"，绝不抛异常。
  * 仅当本地与上游都成功取到且不相等时，才判定 status="drift"（exit 非 0）。
  * ok / unknown 均 exit 0。
  * subprocess.run 通过 subprocess_run 参数可注入，便于单元测试对抗式覆盖。

CLI 用法：
    python scripts/check_upstream_drift.py
    python scripts/check_upstream_drift.py --local-cli <path> --recorded-sha <path>
    python scripts/check_upstream_drift.py --update-record   # 拉到上游 firecrawl sha 后写回基线

注：本文件完全独立（仅依赖标准库），不会 import web-search 下任何业务模块，
可被陌生 Agent 直接 `exec_module` 加载测试。
"""

import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys

# __file__ 位于 web-search/scripts/check_upstream_drift.py
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_SEARCH_DIR = os.path.dirname(SCRIPT_DIR)

DEFAULT_LOCAL_CLI = os.path.join(
    WEB_SEARCH_DIR, "anysearch-skill", "scripts", "anysearch_cli.py"
)
DEFAULT_RECORDED_SHA = os.path.join(WEB_SEARCH_DIR, ".upstream_sha.json")

FIRECRAWL_RECORD_KEY = "firecrawl_openapi_sha"

ANYPATH = "repos/anysearch-ai/anysearch-skill/contents/scripts/anysearch_cli.py"
FIREPATH = "repos/firecrawl/firecrawl/contents/apps/api/openapi.json"


def sha256_file(path):
    """读文件算 sha256；文件缺失或不可读返回 None（绝不抛）。

    分块读取，避免一次性把大文件（如 113KB 的 openapi.json）全部读入内存。
    """
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except (OSError, ValueError):
        # OSError: 文件缺失 / 权限问题；ValueError: 路径是目录等边界
        return None


def _gh_api_json(api_path, subprocess_run):
    """调用 `gh api <api_path>` 并返回解析后的 dict。

    任何失败（gh 缺失 / 非零返回 / JSON 解析失败）都会由其调用方捕获并降级为 unknown。
    这里只负责「成功路径」，失败一律抛异常让上层降级。
    """
    cmd = ["gh", "api", api_path]
    if subprocess_run is None:
        subprocess_run = subprocess.run
    proc = subprocess_run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "gh api non-zero rc=%s: %s"
            % (proc.returncode, (proc.stderr or "").strip()[:200])
        )
    return json.loads(proc.stdout)


def _decode_base64_content(content_b64):
    """GitHub contents API 的 content 是带换行的 base64，去掉空白后解码。"""
    if not content_b64:
        return None
    cleaned = content_b64.replace("\n", "").replace("\r", "").replace(" ", "")
    try:
        return base64.b64decode(cleaned)
    except (ValueError, TypeError):
        return None


def check_anysearch(local_cli_path, subprocess_run=None):
    """比对本地 anysearch_cli.py 与上游的 sha256。

    返回: {"check":"anysearch","status":"ok"|"drift"|"unknown",
           "local_sha":str|None,"upstream_sha":str|None}
    """
    result = {
        "check": "anysearch",
        "status": "unknown",
        "local_sha": None,
        "upstream_sha": None,
    }
    local_sha = sha256_file(local_cli_path)
    result["local_sha"] = local_sha

    try:
        data = _gh_api_json(ANYPATH, subprocess_run)
        raw = _decode_base64_content(data.get("content"))
        if raw is None:
            # content 缺失 / 解码失败：无法比对，保持 unknown（不误判 drift）
            return result
        upstream_sha = hashlib.sha256(raw).hexdigest()
        result["upstream_sha"] = upstream_sha
        # 关键边界：本地文件缺失（local_sha is None）时，绝不参与比对，
        # 既不谎报 ok 也不谎报 drift，保持 unknown。
        if local_sha is None:
            return result
        result["status"] = "ok" if local_sha == upstream_sha else "drift"
    except FileNotFoundError:
        # gh 命令不存在 → unknown，不崩
        return result
    except Exception:
        # 网络错误 / API 非零 / JSON 解析失败 → unknown，不崩、不误判 drift
        return result
    return result


def check_firecrawl(subprocess_run=None, recorded_sha_path=None):
    """比对本地记录的 firecrawl openapi Git blob sha 与上游 sha。

    返回: {"check":"firecrawl","status":"ok"|"drift"|"unknown",
           "local_sha":str|None,"upstream_sha":str|None}
    """
    if recorded_sha_path is None:
        recorded_sha_path = DEFAULT_RECORDED_SHA

    result = {
        "check": "firecrawl",
        "status": "unknown",
        "local_sha": None,
        "upstream_sha": None,
    }

    # 读取本地基线记录（缺失 / 解析失败 → recorded=None → 无法比对 → unknown）
    recorded = None
    try:
        with open(recorded_sha_path, encoding="utf-8") as f:
            blob = json.load(f)
        recorded = blob.get(FIRECRAWL_RECORD_KEY)
    except (OSError, ValueError):
        recorded = None
    result["local_sha"] = recorded

    try:
        data = _gh_api_json(FIREPATH, subprocess_run)
        upstream_sha = data.get("sha")
        if not upstream_sha:
            # 响应里没有 sha（异常结构）→ unknown
            return result
        result["upstream_sha"] = upstream_sha
        # 关键边界：本地无基线记录时，不谎报 drift，保持 unknown
        if recorded is None:
            return result
        result["status"] = "ok" if recorded == upstream_sha else "drift"
    except FileNotFoundError:
        return result
    except Exception:
        return result
    return result


def update_firecrawl_record(recorded_sha_path=None, upstream_sha=None):
    """将上游 firecrawl sha 写回基线记录文件（best-effort）。

    仅当上游 sha 有效时写入；文件/目录问题静默忽略。
    用于 `python scripts/check_upstream_drift.py --update-record` 建立初始基线。
    """
    if not upstream_sha:
        return False
    if recorded_sha_path is None:
        recorded_sha_path = DEFAULT_RECORDED_SHA
    try:
        existing = {}
        if os.path.exists(recorded_sha_path):
            with open(recorded_sha_path, encoding="utf-8") as f:
                existing = json.load(f)
        existing[FIRECRAWL_RECORD_KEY] = upstream_sha
        with open(recorded_sha_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, sort_keys=True)
            f.write("\n")
        return True
    except (OSError, ValueError):
        return False


def main(argv=None, subprocess_run=None):
    """CLI 入口：打印人类可读漂移报告并决定 exit code。

    exit 0 当所有检查为 ok 或 unknown；仅当检测到实际 drift 时 exit 非 0。
    """
    parser = argparse.ArgumentParser(
        description="web-search 上游漂移检测（best-effort，无网络时 exit 0）"
    )
    parser.add_argument(
        "--local-cli",
        default=DEFAULT_LOCAL_CLI,
        help="本地 anysearch_cli.py 路径（默认 %(default)s）",
    )
    parser.add_argument(
        "--recorded-sha",
        default=DEFAULT_RECORDED_SHA,
        help="firecrawl 基线 sha 记录文件路径（默认 %(default)s）",
    )
    parser.add_argument(
        "--update-record",
        action="store_true",
        help="拉取上游后把 firecrawl sha 写回基线记录文件",
    )
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    if subprocess_run is None:
        subprocess_run = subprocess.run

    results = [
        check_anysearch(args.local_cli, subprocess_run=subprocess_run),
        check_firecrawl(
            subprocess_run=subprocess_run, recorded_sha_path=args.recorded_sha
        ),
    ]

    # --update-record：成功取到上游 firecrawl sha 时写回基线
    if args.update_record:
        fc = next(r for r in results if r["check"] == "firecrawl")
        if fc["upstream_sha"]:
            ok = update_firecrawl_record(args.recorded_sha, fc["upstream_sha"])
            if ok:
                print(
                    "[baseline] 已更新 firecrawl 基线 sha -> %s" % fc["upstream_sha"]
                )

    # 人类可读报告
    print("=" * 56)
    print("web-search 上游漂移检测报告")
    print("=" * 56)
    has_drift = False
    for r in results:
        mark = {
            "ok": "OK  ",
            "drift": "DRIFT",
            "unknown": "UNKNOWN",
        }.get(r["status"], r["status"].upper())
        print("  [%-7s] %-10s" % (mark, r["check"]))
        print("      local   : %s" % r["local_sha"])
        print("      upstream: %s" % r["upstream_sha"])
        if r["status"] == "drift":
            has_drift = True
    print("=" * 56)
    if has_drift:
        print("结论：检测到上游漂移，请按 README 同步记录表跟进上游。")
        sys.exit(1)
    print("结论：无漂移（或无法判定/无网络，视为通过）。")
    sys.exit(0)


if __name__ == "__main__":
    main()
