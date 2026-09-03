# 中文医学分析助手 · 可移植安装包（open-medical-skills）

> 本文件是**唯一事源（Single Source of Truth）**：部署、更新、配置、使用、仓库纪律全部以本文件为准。任何 Agent 阅读本文件后，应能**自动、自主**完成「部署安装」与「跟随上游演进更新」两件事务，无需人工中转。

---

## 模块一 · 项目概述

**这是什么**：一个把「Open-Medica/open-medical-skills 原生医学 AI 技能」封装为**中文可移植安装包**的父技能工程。它面向两个核心需求：

- **场景①**：用户描述**症状** → 分析病情 / 病因 / 可能的疾病 / 诊疗建议。
- **场景②**：用户提供**检验或检查报告** → 分析病情 / 病因 / 建议，并评估诊疗方案。

**能做什么**：

- 通过父技能统一做**中文适配**与**默沙东诊疗手册（MSD Manuals 中文版）参考源注入**。
- 通过 4 个原生子技能覆盖上述两大场景：
  - `clinical-differential-diagnosis`（鉴别诊断）
  - `lab-result-interpreter`（检验结果解读）
  - `clinical-treatment-plan-generator`（诊疗方案生成与评估）
  - `drug-interaction-checker`（药物相互作用安全检查）

**不能做什么（边界）**：

- 不替代医生，不给出确诊、不开具处方、不承诺疗效。
- 不修改上游原生技能内容（父子解耦，见模块三）。
- 四个原生子技能已作为 **vendored 副本提交进本仓库**（离线可用、确定性部署）；`upstream/` 仅作同步缓存，不入库。

**许可证**：MIT（原生技能与父技能均遵循 MIT）。

**免责声明**：本助手基于公开医学资料与 AI 技能做信息整合，仅供健康理解与就医参考，**不构成诊断、治疗或用药建议**，不能替代执业医师的当面评估。急症请立即就医。

---

## 模块二 · 前置条件

| 依赖 | 版本要求 | 用途 | 缺失时 |
|------|----------|------|--------|
| `node` | ≥ 16.7（需 `fs.cpSync`） | 运行 `deploy.mjs`（部署） | 部署无法进行 |
| `python` | ≥ 3.8 | 运行 `sync_openmedical.py`（同步） | 无法跟进上游 |
| `git` | ≥ 2.30 | 同步时克隆/拉取上游仓库 | 同步无法刷新上游缓存 |
| 网络 | 可访问 `github.com` | 同步时拉取 `Open-Medica/open-medical-skills` | 仅能离线部署已入库副本 |
| 目标路径 | 目标 Agent 的 `skills` 目录存在或可创建 | 接收安装产物 | 部署失败 |

> 说明：`git` 默认取 PATH 中的 `git`；若需指定，可设环境变量 `GIT_BIN`（如 `GIT_BIN="D:/Tools/Assembly/git/bin/git.exe" python scripts/sync_openmedical.py`）。`python` 同理可用 `PYTHON_BIN` 指定。

---

## 模块三 · 目录结构与父子框架（解耦边界）

```
open-medical-skills/                ← 父技能包根目录（本仓维护，可移植）
├── SKILL.md                        ← 父技能主定义文件（Agent 阅读、执行；本地化改造层）
├── README.md                       ← 本文件（唯一事源）
├── VENDORING.md                    ← vendored 同步纪律（硬规则）
├── config.json                     ← 部署配置（上游地址、目标、技能清单；单一事实源）
├── .gitignore                      ← 排除 upstream/（同步缓存，不入库）
├── scripts/
│   ├── deploy.mjs                  ← 一键部署（默认离线，从入库副本复制；--sync 联网刷新）
│   └── sync_openmedical.py         ← 主同步脚本：刷 upstream 缓存 → 刷新 vendored 副本
├── clinical-differential-diagnosis/   ← 【子·vendored 副本，进库】
│   ├── SKILL.md
│   └── .upstream_version
├── lab-result-interpreter/            ← 【子·vendored 副本，进库】
├── clinical-treatment-plan-generator/ ← 【子·vendored 副本，进库】
├── drug-interaction-checker/          ← 【子·vendored 副本，进库】
└── upstream/                       ← 【缓存】原生 Open-Medica/open-medical-skills 克隆
                                      （gitignored，不入版；仅 sync 脚本使用）
```

**解耦原则（硬规则）**：

1. **父侧可改**：`SKILL.md`、`README.md`、`VENDORING.md`、`config.json`、`scripts/`、`.gitignore` —— 由本仓（AI_MCP-Skill-CLI）定制维护。
2. **子侧只读**：四个子技能目录内的 `SKILL.md` 是 Open-Medica 上游的**逐字副本、零本地补丁**；仅由 `sync_openmedical.py` 产生与刷新，父侧任何脚本、文档、人工都不得改写其中内容。
3. **部署产物形态**：部署时，vendored 子技能以独立目录（如 `clinical-differential-diagnosis/`）并行安装于目标 Agent 的 `skills/` 下；父技能以 `open-medical-skills/` 目录安装。二者并列、互不嵌套，父通过「读取子目录 SKILL.md 执行」使用子，从而保持解耦。

---

## 模块四 · 配置说明（config.json）

| 字段 | 含义 | 是否常改 |
|------|------|----------|
| `upstream.repo` | 原生仓库地址 | 否 |
| `upstream.branch` | 跟踪分支（默认 `main`） | 否 |
| `upstream.skills_subdir` | 原生技能在仓库内的子目录（默认 `skills`） | 否 |
| `native_skills` | 要 vendored 的原生技能名数组（对应模块一四个技能） | 偶尔（增减能力时） |
| `parent_skill_name` | 父技能在目标端安装的目录名（默认 `open-medical-skills`） | 否 |
| `targets` | 部署目标列表，每项含 `agent`（标识）与 `skills_dir`（目标 Agent 的 skills 目录，`~` 表示用户主目录） | 是（按本机实际环境） |
| `merck_manual` | 默沙东诊疗手册中文参考源链接 | 否 |

修改 `targets` 以适配你本机的 Agent 安装位置；例如 WorkBuddy 用户技能目录通常为 `~/.workbuddy/skills`。

---

## 模块五 · 一键部署（自动自主）

部署脚本**默认离线**（直接使用已入库的 vendored 副本），**幂等**：可反复运行，结果一致。

**标准部署（全部目标，离线）**：

```bash
cd open-medical-skills
node scripts/deploy.mjs
```

**仅部署到某个 Agent**（如 workbuddy）：

```bash
node scripts/deploy.mjs --target workbuddy
```

**部署前先联网同步最新上游**：

```bash
node scripts/deploy.mjs --sync
```

**预览将要做什么（不改动文件）**：

```bash
node scripts/deploy.mjs --dry-run
```

部署完成后，目标 Agent 的 `skills/` 下将出现：

```
skills/
├── open-medical-skills/        ← 父技能（本包定制）
├── clinical-differential-diagnosis/
├── lab-result-interpreter/
├── clinical-treatment-plan-generator/
└── drug-interaction-checker/
```

> 备选原生安装方式（无需本包也可，但缺少中文适配与默沙东注入）：
> `npx skills add Open-Medica/open-medical-skills --skill <技能名> -a <agent>`
> 或先 `npm i -g @openmedica/cli` 再 `oms install <技能名> --agent <agent>`。

---

## 模块六 · 跟随上游演进（Agent 自主更新）

上游 `Open-Medica/open-medical-skills` 会持续更新。本包通过 `scripts/sync_openmedical.py` 把四个原生子技能作为 vendored 副本同步到最新（同时刷新 `upstream/` 缓存并写回 `.upstream_version`）。

### 触发词（用户显式指令）

当用户明确说出以下任一意图时，即触发「跟进上游」动作：

- 「更新上游」/「同步上游」/「同步子技能」
- 「跟进 Open-Medica 演进」/「拉取最新医学技能」
- 「把原生技能更新到最新」

### Agent 执行步骤（读本章节即可自主完成）

1. 确认当前工作目录为本包根（`open-medical-skills/`）。
2. 运行主同步脚本（联网，best-effort）：
   ```bash
   python scripts/sync_openmedical.py
   ```
   该脚本会：确保 `upstream/` 缓存最新 → 文件级复制四子技能到顶层 vendored 目录 → 写回 `.upstream_version`。
3. 验证一致性（可选）：
   ```bash
   python scripts/sync_openmedical.py --check-drift
   ```
4. 预览改动（谨慎）：
   ```bash
   python scripts/sync_openmedical.py --dry-run
   ```
5. 将变动提交进本仓库（遵循 `AGENTS.md` 纪律，详见模块九）；随后重新部署：`node scripts/deploy.mjs --sync`。

---

## 模块七 · 使用方式（两大场景触发）

部署后，在目标 Agent 中调用父技能 `open-medical-skills` 即可。父技能会按场景路由到原生子技能：

- **场景①（症状分析）**：告诉 Agent 你的症状，它会读取 `clinical-differential-diagnosis` 给出病因方向、可能疾病、就诊与初步建议，并以默沙东诊疗手册交叉核对。
- **场景②（报告/方案分析）**：提供检验/检查报告，它会用 `lab-result-interpreter` 解读异常、用 `clinical-treatment-plan-generator` + `drug-interaction-checker` 生成并评估诊疗方案，再交叉核对默沙东资料。

所有输出均为**中文**，并附**免责声明**。详见 `SKILL.md`。

---

## 模块八 · 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `config.json 解析失败` | 文件被手改损坏 | 用 JSON 校验工具检查括号/引号 |
| 部署时 `vendored 子技能缺失` | 尚未同步或上游更名 | 运行 `python scripts/sync_openmedical.py` 刷新 |
| `git clone 失败` | 网络/代理无法访问 github.com | 检查网络，或手动 `git clone` 到 `upstream/` |
| 同步脚本找不到 git | PATH 无 git 或沙箱限制 | 用 `GIT_BIN` 指定绝对路径 |
| 目标目录写入失败 | 路径不存在或无权限 | 确认 `config.targets[].skills_dir` 正确且有写权限 |
| 技能未出现在 Agent 中 | 目标路径不对或未重启 Agent | 核对 `skills_dir`，重启 Agent 让其扫描新技能 |
| 中文适配不生效 | 调用的不是父技能而是原生技能 | 确认调用入口为 `open-medical-skills`（父） |

---

## 模块九 · 仓库纪律须知（本包位于 AI_MCP-Skill-CLI 内）

本安装包存放于 `D:\Documents\AI_MCP-Skill-CLI\open-medical-skills`，该目录是 GitHub 仓库 `AI_MCP-Skill-CLI`（你的远端仓库(origin) 为 `zhangweildlh/AI_MCP-Skill-CLI`）的子目录，须遵循其纪律（详见仓库根 `AGENTS.md`）。

1. **scope 登记前置**：`open-medical-skills` 属「目录型 Skill」，其 scope 标识为 `dir/open-medical-skills`，**必须先在 `AGENTS.md` 第 2.1 章登记**，否则 worktree 提交会被 pre-commit 拦截（无法从分支名解析 scope）。
2. **两步走（硬顺序）**：
   - 第一步（meta 变更）：在独立分支修改 `AGENTS.md` 登记 `dir/open-medical-skills`，提交、推送(push)到 origin、开 PR、合并(main)。
   - 第二步（dir 变更）：上述合并后，用 worktree 流程（`feat/open-medical-skills-<topic>-<14位时间戳>`）提交本包全部文件，提交、推送、开 PR、合并。
   - 顺序不可颠倒：未登记 scope 前，第二步的 worktree 提交必被 pre-commit 拒绝。
3. **只推自有 fork(origin)**，不推上游；破坏性操作需显式授权。
4. 本包内 `upstream/` 由 `.gitignore` 排除，不会进入版本库；四个子技能目录（vendored 副本）**会**进入版本库。

> 实际操作命令序列（在已登录 `gh` 的终端执行）见随本包一同交付的「部署 Playbook」（由交付方提供），其中已规避已知的 `git branch <分支> main` 显式起点缺陷，统一改用「从 HEAD 建分支 → 再挂工作树」的两步法。
