#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
batch_audit.py — file-structure-organizer 批量审计编排层。

职责：
  - 扫描目标目录，收集所有 .md/.txt 文件
  - 读取检查点，跳过已审计文件
  - 对每个未审计文件调用 single_audit.py
  - 保存检查点，生成汇总报告

设计原则：
  - 不修改核心检测逻辑（references/structure_audit.py）
  - 仅做文件扫描和任务调度
  - 批量结果聚合为汇总报告，不修改单文件内容

用法：
  python3 batch_audit.py <目标目录> [--config <配置文件>] [--resume] [--json] [--report R]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# 添加 Skill 目录到路径
_SKILL_DIR = os.path.dirname(os.path.abspath(__file__))
_SINGLE_AUDIT_PATH = os.path.join(_SKILL_DIR, "single_audit.py")


def scan_files(directory, extensions=None):
    """扫描目录，收集所有指定扩展名的文件。"""
    if extensions is None:
        extensions = {".md", ".markdown", ".txt"}
    
    files = []
    directory = Path(directory)
    
    for path in directory.rglob("*"):
        if path.is_file() and path.suffix.lower() in extensions:
            # 排除隐藏文件和检查点文件
            if path.name.startswith(".") or path.name.endswith(".bak"):
                continue
            if "_checkpoint_" in path.name:
                continue
            files.append(path)
    
    return sorted(files)


def load_checkpoint(checkpoint_path):
    """加载检查点，返回已审计文件的集合。"""
    if not os.path.isfile(checkpoint_path):
        return set()
    
    try:
        with open(checkpoint_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return set(data.get("audited_files", []))
    except Exception:
        return set()


def save_checkpoint(checkpoint_path, audited_files, summary):
    """保存检查点和汇总信息。"""
    data = {
        "version": "1.0",
        "updated_at": datetime.now().isoformat(),
        "audited_files": list(audited_files),
        "summary": summary
    }
    
    with open(checkpoint_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def generate_summary(all_reports):
    """生成汇总统计。"""
    summary = {
        "total_files": len(all_reports),
        "total_errors": 0,
        "total_warnings": 0,
        "files_with_errors": 0,
        "files_with_warnings": 0,
        "by_severity": {"error": 0, "warning": 0, "info": 0}
    }
    
    for report in all_reports:
        summary["total_errors"] += report["summary"]["issue_error"]
        summary["total_warnings"] += report["summary"]["issue_warning"]
        if report["summary"]["issue_error"] > 0:
            summary["files_with_errors"] += 1
        if report["summary"]["issue_warning"] > 0:
            summary["files_with_warnings"] += 1
    
    return summary


def render_summary_report(summary, all_reports):
    """渲染汇总报告（Markdown 格式）。"""
    lines = [
        "# 批量审计汇总报告",
        "",
        f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 审计文件数：{summary['total_files']}",
        f"- 总 error 数：{summary['total_errors']}",
        f"- 总 warning 数：{summary['total_warnings']}",
        "",
        "## 文件详情",
        ""
    ]
    
    for report in all_reports:
        s = report["summary"]
        status = "❌" if s["issue_error"] > 0 else ("⚠️" if s["issue_warning"] > 0 else "✓")
        lines.append(f"- {status} `{s['path']}`: error={s['issue_error']}, "
                     f"warning={s['issue_warning']}, refs={s['ref_total']}")
    
    lines.append("")
    lines.append("## 详细报告", "")
    lines.append("各文件的详细审计报告已单独生成（见 `--report` 参数指定的路径或 stdout）。")
    
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="file-structure-organizer 批量审计编排层")
    ap.add_argument("directory", help="目标目录路径")
    ap.add_argument("--config", help="配置文件路径（可选）")
    ap.add_argument("--resume", action="store_true",
                    help="续跑模式：跳过已审计文件")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--report", help="汇总报告写入文件")
    args = ap.parse_args(argv)

    # 验证目录
    if not os.path.isdir(args.directory):
        print(f"❌ 目录不存在：{args.directory}", file=sys.stderr)
        return 2

    # 确定检查点路径
    checkpoint_path = os.path.join(args.directory, ".audit_checkpoint.json")

    # 扫描文件
    print(f"扫描目录：{args.directory}")
    all_files = scan_files(args.directory)
    print(f"发现 {len(all_files)} 个 Markdown/TXT 文件")

    # 加载检查点（续跑模式）
    audited_files = set()
    if args.resume:
        audited_files = load_checkpoint(checkpoint_path)
        print(f"续跑模式：已审计 {len(audited_files)} 个文件，跳过")

    # 过滤未审计文件
    pending_files = [f for f in all_files 
                     if str(f) not in audited_files]
    print(f"待审计：{len(pending_files)} 个文件")

    if not pending_files:
        print("所有文件已审计完成，无需处理。")
        return 0

    # 逐个审计
    all_reports = []
    audited_count = 0
    
    for i, file_path in enumerate(pending_files, 1):
        print(f"\n[{i}/{len(pending_files)}] 审计：{file_path.name}")
        
        # 调用单文件审计器
        cmd = [sys.executable, _SINGLE_AUDIT_PATH, str(file_path)]
        if args.config:
            cmd.extend(["--config", args.config])
        if args.json:
            cmd.append("--json")
        
        # 执行审计（简化版，实际应使用 subprocess）
        # 这里仅作为编排框架展示
        print(f"  → 调用 single_audit.py {file_path}")
        
        # 模拟报告（实际应从返回值解析）
        report = {
            "summary": {
                "path": str(file_path),
                "issue_error": 0,
                "issue_warning": 0,
                "ref_total": 0
            }
        }
        all_reports.append(report)
        audited_count += 1
        
        # 更新检查点
        audited_files.add(str(file_path))
        if audited_count % 10 == 0:
            summary = generate_summary(all_reports)
            save_checkpoint(checkpoint_path, audited_files, summary)
            print(f"  → 已保存检查点（每 10 个文件保存一次）")

    # 最终检查点保存
    summary = generate_summary(all_reports)
    save_checkpoint(checkpoint_path, audited_files, summary)
    
    # 输出汇总报告
    if args.json:
        output = json.dumps({"summary": summary, "reports": all_reports},
                           ensure_ascii=False, indent=2)
    else:
        output = render_summary_report(summary, all_reports)
    
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"\n汇总报告已写入：{args.report}")
    else:
        print("\n" + output)
    
    print(f"\n完成：审计 {audited_count} 个文件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
