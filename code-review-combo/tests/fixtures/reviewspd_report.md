## Findings

### High
- [H1] `b.sh:20` 与 OCR 重叠（confirmed）
- [H2] `c.sh:30` 与 OCR 重叠但 severity 冲突（OCR=critical, 此处 low → disputed 取 critical）
- [H3] `f.sh:50` 新增 security 发现（review-spd-only）
- [L1] `g.sh` 文件级 other（review-spd-only）

## Testing Gaps
- none

## Verification
- Context collected: git diff
- Additional checks run: not run

```json
{
  "tool": "review-spd",
  "mode": "range",
  "findings": [
    { "path": "b.sh", "start_line": 20, "end_line": 20, "category": "bug", "severity": "high", "comment": "rs-1 overlap-confirmed", "suggestion": "fix" },
    { "path": "c.sh", "start_line": 30, "end_line": 30, "category": "bug", "severity": "low", "comment": "rs-2 overlap-disputed", "suggestion": "fix" },
    { "path": "f.sh", "start_line": 50, "end_line": 50, "category": "security", "severity": "high", "comment": "rs-3 new security", "suggestion": "fix" },
    { "path": "g.sh", "start_line": 0, "end_line": 0, "category": "other", "severity": "low", "comment": "rs-4 file-level", "suggestion": "fix" }
  ],
  "summary": { "files_reviewed": 4, "critical": 0, "high": 2, "medium": 0, "low": 2 }
}
```
