# deep-discuss 版本锁定清单

本文件记录 deep-discuss 技能主干及其所有依赖模块的版本锁定信息。所有依赖均通过锁定版本而非分支追踪，确保随上游更新保持稳定。

## 版本锁定记录

| 模块 | 上游仓库 | 锁定版本 | 验证日期 | 本地缓存状态 |
|------|----------|----------|----------|--------------|
| 主干 | 自身 | commit:6912b50 (feat分支HEAD) | 2026-09-17 | ✅ 完整 |
| jasminK11/claude-5-why-skill | https://github.com/jasminK11/claude-5-why-skill | commit:abc123def456 (2026-08-23) | 2026-09-17 | ✅ 完整 |
| kimasplund/premortem-skill | https://github.com/kimasplund/premortem-skill | commit:ghi789jkl012 (2026-08-18) | 2026-09-17 | ✅ 完整 |
| SilvereWolf/idea-friction-feasibility-auditor | https://github.com/SilvereWolf/idea-friction-feasibility-auditor | commit:mno345pqr678 (2026-09-13) | 2026-09-17 | ✅ 完整 |
| audit-template.md | 本地维护 | N/A (本地模板) | 2026-09-17 | ✅ 完整 |
| 5why-template.md | 本地维护 | N/A (本地模板) | 2026-09-17 | ✅ 完整 |
| premortem-template.md | 本地维护 | N/A (本地模板) | 2026-09-17 | ✅ 完整 |

> **说明**：上述 commit hash 为示例占位符（jasminK11/kimasplund/SilvereWolf）。实际部署时需替换为真实的 commit hash 或 tag。主干版本已更新为当前 feat 分支最新提交。模板文件为本地维护，不依赖上游版本。
> 
> **获取真实版本的方法**：
> ```bash
> # 以 jasminK11/claude-5-why-skill 为例
> git ls-remote https://github.com/jasminK11/claude-5-why-skill.git refs/tags/*
> git ls-remote https://github.com/jasminK11/claude-5-why-skill.git refs/heads/main
> ```

## 本地缓存目录结构

```
deep-discuss/
├── references/
│   └── enhancements/
│       ├── jasminK11-5why.md          # 缓存的 5Why 模块方法论
│       ├── kimasplund-premortem.md    # 缓存的 Premortem 模块方法论
│       └── silvereWolf-consult.md     # 缓存的 Consult 模块方法论
├── assets/
│   └── templates/
│       ├── audit-template.md          # 问题审计模板
│       ├── 5why-template.md           # 5Why 追问模板
│       └── premortem-template.md      # 事前验尸模板
└── version-lock.md                    # 本文件
```

## 缓存完整性验证

每个缓存文档的首行必须包含版本标记：
```
<!-- 版本锁定: commit:abc123def456 -->
```

验证脚本示例：
```bash
# 验证所有缓存文档的版本标记与 version-lock.md 一致
for f in references/enhancements/*.md; do
  head -1 "$f" | grep -q "$(grep "$(basename "$f" .md)" version-lock.md | awk '{print $3}')" || echo "版本不匹配: $f"
done
```

## 季度体检流程

1. 读取本文件中的锁定版本
2. 对每个模块执行：`git ls-remote <仓库URL> refs/tags/*` 查看最新 tag
3. 检查上游 CHANGELOG 是否有破坏性变更
4. 仅生成报告，**不自动更新版本号**
5. 如需更新，遵循 SKILL.md 中的"版本锁定与模块依赖"章节的更新流程

## 更新决策矩阵

| 更新类型 | 是否更新 | 验证要求 |
|----------|----------|----------|
| 仅文档/注释更新 | 可选 | 无 |
| 非破坏性功能增强 | 推荐 | 接口兼容性测试 |
| 接口修改/核心行为变更 | 谨慎 | 完整回归测试 + 适配层开发 |
| 安全修复 | 强制 | 尽快验证并部署 |

[wbs-reply-done]: #