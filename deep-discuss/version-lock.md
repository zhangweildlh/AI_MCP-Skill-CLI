# deep-discuss 版本锁定清单

本文件记录 deep-discuss 技能主干及其所有依赖模块的版本锁定信息。所有依赖均通过锁定版本而非分支追踪，确保随上游更新保持稳定。

## 版本锁定记录

| 模块 | 上游仓库 | 锁定版本 | 验证日期 | 本地缓存状态 |
|------|----------|----------|----------|--------------|
| 主干 | 自身 | commit:ef2a19a (主干锁定 @ 2026-09-18；与 main HEAD 对齐，主干随 main 演进) | 2026-09-18 | ✅ 完整 |
| jasminK11/claude-5-why-skill | https://github.com/jasminK11/claude-5-why-skill | commit:b32cb7acc5837f3b9757e269acae7b58805446dc (main HEAD, 2026-09-17) | 2026-09-17 | ✅ 完整 |
| kimasplund/premortem-skill | https://github.com/kimasplund/premortem-skill | commit:1baa5cd2e15f2eae4a52b8de72884de09582cb0e (main HEAD, 2026-09-17) | 2026-09-17 | ✅ 完整 |
| SilvereWolf/idea-friction-feasibility-auditor | https://github.com/SilvereWolf/idea-friction-feasibility-auditor | commit:ba850a7d24136875670f5d3c880d9988d95fa42d (main HEAD, 2026-09-17) | 2026-09-17 | ✅ 完整 |
| audit-template.md | 本地维护 | N/A (本地模板) | 2026-09-17 | ✅ 完整 |
| 5why-template.md | 本地维护 | N/A (本地模板) | 2026-09-17 | ✅ 完整 |
| premortem-template.md | 本地维护 | N/A (本地模板) | 2026-09-17 | ✅ 完整 |

> **说明**：上述 3 个上游模块的 commit 为经 `git ls-remote <repo> refs/heads/main` 核实的 **main HEAD 真实值（2026-09-17）**；三仓库目前均未发布 tag，故锁定至 main HEAD（后续上游发布 tag 时建议改为 tag 钉固以提升可复现性）。主干锁定至 commit:ef2a19a（@ 2026-09-18，与 main HEAD 对齐），随 main 演进。模板文件为本地维护，不依赖上游版本。
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
<!-- 版本锁定: commit:b32cb7acc5837f3b9757e269acae7b58805446dc -->
```

验证脚本示例（按缓存文件首行 commit hash 反查 version-lock.md，避免文件名与仓库名子串不匹配；并扩展校验「更新记录↔首行」与「主干锁↔main HEAD」两处易遗漏链路）：
```bash
# 验证所有缓存文档的版本标记与 version-lock.md 一致（含更新记录与主干锁自洽）
for f in references/enhancements/*.md; do
  commit=$(head -1 "$f" | grep -oP 'commit:\K\S+')
  if [ -n "$commit" ]; then
    # ① 首行 commit 须出现在锁定表
    grep -q "$commit" version-lock.md || echo "FAIL 首行版本未锁定: $f ($commit)"
    # ② 更新记录引用的 commit 须与首行一致（防占位符遗留）
    rec=$(grep -oP '基于 \S+@\K\S+' "$f" | head -1)
    if [ -n "$rec" ] && [ "$rec" != "$commit" ]; then
      echo "FAIL 更新记录与首行不一致: $f (更新记录=$rec, 首行=$commit)"
    fi
  fi
done
# ③ 主干锁 commit 须等于当前 main HEAD（防锁过期）
main_head=$(git rev-parse --short main 2>/dev/null)
lock=$(grep -oP '^\| 主干 \| 自身 \| commit:\K\S+' version-lock.md | head -1)
if [ -n "$main_head" ] && [ -n "$lock" ]; then
  if [ "$lock" != "$main_head" ]; then
    echo "FAIL 主干锁过期: version-lock.md 主干=$lock, 实际 main HEAD=$main_head"
  fi
fi
echo "自检完成"
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

