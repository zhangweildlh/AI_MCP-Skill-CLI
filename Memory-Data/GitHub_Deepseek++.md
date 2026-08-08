# 永久记忆（跨项目）

> 跨项目永久记忆提炼版，本文件聚焦 **GitHub 操作**，并保留少量通用基础约束（Docker 禁用、回答风格、目录工具链、Git 撤销/回退、账号身份、gh 能力边界）；原文件中与 GitHub 无关的 Python/Node 环境管理、Dynamic-mcp 入口、mimo 协同、PowerShell/Git Bash 编码坑等已剔除。
> 按「**会话启动 → 环境基础 → 账户身份 → 标准工作流 → Fork专项实证 → 技能提醒**」六大篇组织，遵循实际操作顺序排列。
> 单一事实源，避免重复；不同章节对同一事源/事项/要求/流程/操作的描述必须一致、互不矛盾。
>
> ⚠️ **环境事实边界**：第 6 章（及第 2.1 节 Docker 禁用）的工具链路径（如 `D:\Tools\Assembly`）、目录约定、解释器位置均为**本机（Windows 11 / D: 盘）环境事实**，仅对本机通用；**迁移机器须整体更新，切勿当作跨机器通用规则**。账户名、邮箱（第 8 章  `### 8.1 用户名与邮箱`）为跨项目通用身份，不受此限。
>
> ⚠️ **项目特定内容边界**：本跨项目记忆只沉淀**通用方法、硬禁令、环境约束与身份**。任何仅对某个具体仓库成立的操作约束、当前状态、个性化协作规则，一律归属该仓库的**项目级记忆**（`D:\Documents\AI_Work_Temp\<仓库>\.workbuddy\memory/MEMORY.md`），不在本文件重复（详见第 8 章  `### 8.2 Fork 仓库清单（账户资产索引）` 声明）。

---

# 速查索引表（适用场景 → 目标标题）

| 你要做的 | 你要阅读/执行的 |
| ------ | ------ |
| 准备强推(force push)、删除分支、或任何可能动到 main / 受保护分支的动作；判断某个 git 动作是否触碰全局红线 | `### 1.1 禁止强推/删除自家 main（及受保护分支）` |
| 已确认必须执行破坏性动作（强推 / 删分支 / 删标签 / 发版），需要走授权流程；用户说"可以推了""删吧"但未走三段式 | `### 1.2 二次显式授权铁律` |
| 执行 git add / git commit / git push 前的隐私与污染检查；判断测试目录、日志、截图、密钥是否可以入库 | `### 1.3 入库隐私闸门（2026-08-04 实测拦截后确立）` |
| 需要撤销提交、回退改动、丢弃工作区修改；纠结用 reset 还是 revert；误提交后如何安全恢复 | `### 1.4 Git 撤销/回退安全（reset 三模式 + 硬约束）` |
| 出现"用 Docker 部署 / docker run / docker compose"的念头或建议；文档要求容器化安装 | `### 2.1 Docker 禁用` |
| 组织任何一次回复的措辞与结构；不确定该用术语还是大白话 | `## 第3章 回答风格硬性规则（对所有回答永久生效）` |
| 回复中要出现 origin / upstream / PR / commit 等英文术语时的表述规范 | `### 3.2 规则二：所有回答一律用「汉语 + (英语单词)」表述` |
| 内部思考、推理、分析、工具调用输出的语言要求；发现自己用了英文推理 | `### 3.3 规则三：所有内部推理与工具调用输出也必须用中文` |
| 多份报告 / 多个信息源结论打架；想输出"方案A或方案B你选"；想保留多版并存结论 | `### 3.4 规则四：结论必须唯一` |
| 需要确定工作目录 / Skill 目录 / GitHub 仓库根目录 / 临时目录 / 工具根目录 到底在哪 | `### 6.1 目录根约定` |
| 要调用 Node / UV / Python / Git / gh / ffmpeg / WMIC 等本机工具，需要它们的安装绝对路径 | `### 6.2 本地工具安装位置（适用于 Windows 环境）` |
| 同一个工具本机有多个版本（内置运行时 vs 自装工具链），需要决定用哪个 | `### 6.3 严格优先规则` |
| 要执行 git 或 gh 命令，需要可执行文件的绝对路径 | `### 7.1 git / gh 本地路径` |
| git 推送 / gh 调用出现认证失败、令牌失效、要求输入密码 | `### 7.2 凭证助手桥接` |
| 判断某件事 gh 到底能不能做（能力边界），避免设计出跑不通的方案 | `### 7.4 能力边界（重要）` |
| 需要提交作者信息、配置 user.name / user.email、确认账号身份 | `### 8.1 用户名与邮箱` |
| 需要知道我名下有哪些 fork 仓库、各自的上游是谁、本地路径在哪 | `### 8.2 Fork 仓库清单（账户资产索引）` |
| 想知道 gh 命令行整体能做什么；要挑一条合适的 gh 子命令 | `## 第9章 gh 能力速查` |
| 要创建 / 查看 / 评论 / 合并 / 关闭 PR，需要具体的 gh pr 命令写法 | `### 9.3 Pull Request（《gh pr》）` |
| 要在 GitHub 全站搜代码、搜仓库、搜 issue | `### 9.5 全站搜索（《gh search》）` |
| gh 子命令覆盖不到的功能，需要直接打 GitHub REST / GraphQL 接口 | `### 9.6 原生 API 访问（《gh api》）` |
| 要查看 CI 运行状态、拉失败日志、重跑失败 job、手动触发 workflow | `### 9.7 CI/CD（《gh run》 / 《gh workflow》）` |
| 要创建 Release、上传或下载发布产物 | `### 9.8 发布与制品（《gh release》）` |
| 每个新任务、每条 git/gh 流程开工前的第 0 步；不确定当前在哪个目录 | `## 第10章 路径核验` |
| 要写出正确的路径核验命令（含中文路径、含空格路径的处理） | `### 10.2 规则二：路径核验的正确命令写法` |
| 路径核验结果与预期不符、找不到 .git、目录疑似不对 | `### 10.4 规则四：发现异常先问，对齐后再做` |
| 每次 git commit 之前，判断本次改动是否需要同步 README / CHANGELOG / 文档 | `## 第11章 提交前文档同步门禁` |
| 需要执行文档同步检查的具体步骤（查询 → 分析 → 需改先改 → 提交 → 推送） | `### 11.3 执行流程（查询 → 分析 → 需改先改 → 提交 → 推送）` |
| fork 仓库的 CI 行为异常：发布类 job 误触发、rustfmt/clippy 报错、分支保护、审批闸门 | `## 第12章 Fork CI 实证要点` |
| 会话中出现任何 GitHub 相关意图（仓库、分支、PR、CI、发版），动手前的总闸门 | `## 第13章 工作流一 github-personal-manager 自动激活（GitHub 工作流总闸门，前置）` |
| 技能已激活，需要按意图跳到对应的工作流章节或运维脚本 | `### 13.6 激活后执行点索引` |
| 用户给了一个 GitHub 网址要我读；要搜某个仓库、某段代码、某个 issue | `## 第14章 工作流二 信息读取与搜索` |
| 读取 GitHub 信息时该用 gh、WebFetch 还是网页抓取，需要决定优先级 | `### 14.2 优先顺序（硬规则）` |
| 例行仓库巡检：本地 ↔ 我的远端仓库(origin) ↔ 上游仓库(upstream) 三方同步状态检查 | `## 第15章 工作流三 日常同步巡检` |
| 同步时出现冲突、分叉、落后、领先、脏工作区等异常，需要判断后果并决定是否暂停 | `### 15.4 冲突处理（六类问题）` |
| 本地目录没有 .git、仓库文件残缺、本地存在远端没有的独有文件 | `### 15.5 特殊场景（仓库残缺/本地无 .git / 本地独有文件）` |
| 要改代码、提交、推送、开 PR、合并的标准全流程（单分支常规改动） | `## 第16章 工作流四 标准代码修改` |
| 改完代码要提交推送并触发 CI；需要 commit 规范、push 写法、CI 触发条件、PR 正文 --body-file 用法 | `### 16.3 阶段 2 提交 / 推送 / 触发 CI` |
| 改到一半被打断、要临时切分支、需要暂存未完成的改动 | `### 16.8 实用工具：stash 临时抽屉（被打断时保存进度）` |
| 多个任务要并行开发、互不干扰；需要开多个工作树(worktree)并最终普通合并回主线 | `## 第17章 工作流五 多工作树并行开发（–no-ff 普通合并特化）` |
| 功能分支开发完，要以保留分支拓扑的方式合并回 main | `### 17.8 阶段三：《--no-ff》 合并到主线(main)` |
| 并行开发全流程走完，需要逐项验收打勾确认没有遗漏 | `### 17.13 验收闸门清单（四张，逐项打勾）` |
| 想要一份可直接复制执行的并行开发完整命令模板 | `### 17.14 完整命令清单（可复制模板）` |
| CI 变红了，需要定位失败原因并修复回推 | `## 第18章 工作流六 CI 失败排错` |
| git push 报 github.com:443 连接超时或被重置，需要区分偶发瞬断与网络封锁并选择绕行方案 | `#### 18.3.1 git 推送 github.com:443 失败的两类情形（务必区分）` |
| CI 多道门禁串行连环失败（lint / 类型 / i18n / 产物校验），需要逐轮排查方法论 | `#### 18.3.2 通用可移植方法论（某仓库四门禁级联复盘，脱敏）` |
| 要发版、打标签、构建并获取二进制产物 | `## 第19章 工作流七 Release 发版` |
| 分支已合并或已废弃，要清理本地与远端分支、回收陈旧引用 | `## 第20章 工作流八 分支清理回收` |
| 仓库体积异常、想回收悬空对象、需要 git gc / reflog 处理 | `### 20.4 工区内部对象回收（git gc / reflog / 悬空提交）` |
| PR 相关的任何操作：开新 PR、查重、遵循上游规范、回应评审、合并、关闭、收尾 | `## 第21章 工作流九 PR 全生命周期操作` |
| 向某个上游仓库提 PR 前，需要查清它的 CONTRIBUTING、PR 模板、必过 CI 检查 | `### 21.4 阶段 3 — 查询并遵循上游仓库对 PR 的要求与规范（PR 专属，新内容）` |
| 收到 PR 评审意见要回应；PR 全生命周期内的一切代码修改与修 BUG（完整裁决器 + 全局契约面 + 全仓库整体性视角） | `### 21.6 阶段 5 — PR 审查意见回应（核心，含多轮）（PR 专属，新内容）` |
| PR 流程各阶段的强制门禁汇总，动手前逐项确认 | `### 21.10 强门禁总述（PR 全生命周期）` |
| 要清理工区里的垃圾文件、过期产物、临时脚本、截图、报告 | `## 第22章 工作流十 清理工区维护` |
| 判断某个文件属不属于"可删除"（阶段性报告、开发日志、审查报告、临时测试、构建产物） | `### 22.1 可删除文件定义（清理工区时的目标集）` |
| 判断某个文件是否受保护、绝对不能删 | `### 22.3 必须保留与受保护清单（清理工区永不删）` |
| 需要挑选一个跨项目常用技能（深度讨论 / 代码审查 / GitHub 管理 / 联网搜索 / 记忆整合等） | `## 第23章 常用跨项目技能（常驻工具链，跨项目）` |

---

# 第一篇：全局基础与会话启动

> 本篇为最高优先级规则与会话初始化配置，所有操作前必须遵守。

## 第1章 全局禁令（最高优先级）

> 跨项目、跨仓库的硬禁令，优先级高于一切便利。任何 GitHub 操作前先核对本章。

### 1.1 禁止强推/删除自家 main（及受保护分支）

- **禁止对「你的远端仓库(origin) 的 main 分支」执行以下动作**（适用你名下所有仓库，含 `zhangweildlh/*` 各 fork）：
- **强制推送(push)**：`git push --force` / `--force-with-lease` / `-f` 到 `origin/main`；
- **删除 main 分支**：`git push origin --delete main`、`gh api` 删分支、仓库 Settings 删分支、本地 `git branch -D main` 后强推覆盖等。
- **禁止对「任何已开启分支保护(branch protection)的分支」执行强推/删除**（保护规则本身也可能挡下，但禁令优先于规则）。
- **正常（非强推）推送(push)到 main 不受限**：如推标签(tag) `git push origin vX.Y.Z`、或受保护时走 PR 流程合并(merge)后 GitHub 自动更新 main；仅强推与删除被禁。
- **标签移动/重推用「删远端标签 + 重推」（非强推）**：`git push origin :refs/tags/vX` → `git push origin vX`。严禁用 `git push --force-with-lease origin <tag>` 之类的强推手段处理标签，以免与"禁止强推 main"的禁令混淆、且更可审计。
- **宁可多问一次，绝不赌一把**：凡涉及 `main` + `--force` / `--delete` / 分支删除，一律先暂停并大白话说明后果，等明确指令。
- **已落地的双保险（实例）**：某 fork 仓库的 `origin/main` 已于 2026-07-15 通过 `gh` GraphQL 开启分支保护（CI 严格 5 检查全绿、禁强推、禁删分支、管理员可绕过、无审批、未强制要求 PR）。技术保护 + 本约定，双保险。**此实例仅说明"为何立此禁令"，禁令本身对所有仓库（含你名下全部 fork）生效，不绑定该仓库。**

### 1.2 二次显式授权铁律

> 优先级高于一切便利。

- 任何"强推/删除自家 main（或任何受保护分支）"的操作，必须走三段式：

1. 用户先显式授权（表达要做）；
2. 我必须主动暂停，大白话说明后果、列出将执行的精确动作；
3. 用户给出**第二次**显式授权后，方可执行。

- 缺任一环节（尤其第二次授权）一律不执行。
- 标签删除/分支删除等其它破坏性操作不受此铁律限制，但删除类仍遵循各自门禁（先列清单+状态、暂停等确认）。

### 1.3 入库隐私闸门（2026-08-04 实测拦截后确立）

> 目的：防止把浏览器 profile、密码库、Cookies 等隐私数据推送到公开仓库。一旦推送即进入 git 历史，事实上不可撤回。

- **`git add` 前必须 `--dry-run` 预演并逐行核对**，尤其当参数是目录（`git add .` / `git add <dir>/`）时。禁止"先 add 再看"。
- **push 前跑隐私闸门**，命中即中止：```bash
git diff --name-only origin/main..HEAD | grep -iE "profile|Login Data|Cookies|favdb|\.env|id_rsa"
```
- **测试/运行产物目录的 `.gitignore` 一律用「默认拒绝 + 白名单」，禁止黑名单式逐项排除**：```gitignore
<dir>/*
!<dir>/*.md
!<dir>/*.mjs
```

原因（实测事故）：Chrome-Markdown-Edit 的 `.test-run/` 同时生成 `profile/` 与 `profile-<时间戳>/` 两种命名，黑名单只写了 `profile/`，预演中被 `profile-1785730431818/` 逃逸，其中含 360 浏览器 `Login Data`（密码库）与 Cookies，差点推上公开 fork。黑名单只要漏写一种命名就全线失守。
- **Playwright / Selenium 等自动化复用真实浏览器登录态时，其 `userDataDir` 必然含真实凭据**，默认视为隐私资产，永不入库。

### 1.4 Git 撤销/回退安全（reset 三模式 + 硬约束）

> 目的：明确 `git reset` 三种模式的差异与安全边界，避免误用 `--hard` 丢弃未提交改动（尤其误删 `.workbuddy` 记忆）。

- **三模式对比（改动落点）**：

| 模式 | 提交历史 | 工作区改动 | 暂存区改动 | 适用场景 |
| ------ | ------ | ------ | ------ | ------ |
| `git reset --soft HEAD~1` | 删除最近 commit | 保留 | 保留 | 重整理/拆分最近提交（配合 `commit --amend` 或分次提交） |
| `git reset --mixed HEAD~1`（默认） | 删除最近 commit | 保留 | 清空 | 重选提交内容（改动留工作区，重新 `git add`） |
| `git reset --hard HEAD~1` | 删除最近 commit | **删除** | **删除** | 彻底丢弃最近改动（**危险，禁用于含 `.workbuddy` 的工作树**） |

- **安全约束**：
- `--hard` 丢弃的改动**不可恢复**（除非此前有 commit / stash / 在 `git reflog` 窗口内）；执行 `--hard` 前，若工作区有有价值改动，先 `git stash push -m "兜底"` 或确认 `git reflog` 可回捞。
- 回滚**已合并内容**一律用 `git revert`（普通合并回滚唯一命令 `git revert -m 1 <合并碑>`），**禁止** `reset --hard` + 强推，以免违反第1.1 禁强推 main 与"不改写历史"原则。
- 在含 `.workbuddy` 的仓库目录，`reset --hard` / `reset --mixed` + `git clean` 均禁用（防误删项目记忆）。
- `--soft` 仅回退本地未推送提交时安全；若提交已推送且他人/PR 依赖，回退后强推属改写历史，须走第1.2 二次授权铁律且优先用 `git revert`。

---

## 第2章 环境约束

### 2.1 Docker 禁用

- **本机无 Docker，且未来永久不安装 Docker。**
- 任何软件/工具的安装说明、部署方案，只要涉及 Docker（含 `docker`、`docker-compose`/`docker compose`、Docker Desktop、容器镜像 `docker.1ms.run/...`、`.dockerfile`、`compose/*.yaml` 等），**一律直接忽略，不纳入推荐步骤**，也不要提示"用 Docker 更方便"。
- 必须改用**本地原生安装路径**：优先 `D:\Tools\Assembly` 工具链 + UV 管理 Python 项目；若某工具仅提供 Docker 部署、无原生方案，如实告知"该工具依赖容器、本机无法部署"，不虚构本地步骤。

## 第3章 回答风格硬性规则（对所有回答永久生效）

### 3.1 规则一：所有回答必须"大白话"

所有回答必须"大白话"，最大程度减少技术门槛、降低用户理解难度。涉及技术概念、命令、流程时，先用日常语言把"是什么、为什么、会怎样"讲清楚，再给精确命令/术语；避免堆砌术语、缩写、黑话。遇到用户可能不熟的概念，主动用类比或场景化说明。

> **可操作判定规则（满足以下任一条即视为"未达大白话"，须改写）**：
>
> 1. **首遇术语无解释**：某个技术术语 / 缩写首次出现时，未紧跟一句日常语言解释（如"什么是 X、它解决什么"）。
> 2. **连续 3 个以上未解释缩写 / 黑话**：正文连续出现 ≥3 个未被日常语言包裹的英文缩写或行话。
> 3. **只有命令无语境**：直接甩出命令 / 代码片段却不说明"这步在做什么、为什么需要、不做的后果"。
> 4. **类比缺失且概念陌生**：用户明显不熟的概念，只给术语定义、未给生活化类比或场景。
>
> 正例：“我们要把本地改动’推’到 GitHub（就像把文件上传到云端备份），先运行 `git push`——这一步会把你的提交发送出去。”
> 反例：“先 push 一下，看 CI 能不能过。”（“push”"CI"均未解释、无语境）

### 3.2 规则二：所有回答一律用「汉语 + (英语单词)」表述

所有回答一律用「汉语 + (英语单词)」表述，不得出现裸英文单词（如 origin、upstream、push、pull、commit、merge、rebase、feat 等）。统一映射：

| 英文 | 中文映射 |
| ------ | ------ |
| origin | 你的远端仓库(origin) |
| upstream | 上游仓库(upstream) |
| push | 推送(push) |
| pull | 拉取(pull) |
| commit | 提交(commit) |
| merge | 合并(merge) |
| rebase | 变基(rebase) |
| feat 分支 | 功能分支(feat) |

错误→正确示例：

- “将来合 upstream” → “将来与上游仓库(upstream)合并”
- “还没 push” → “还没推送(push)”
- “已经往 origin/main” → “已经往 你的远端仓库(origin)/main”

> 注：代码块内的 git/gh 命令保留原样（如 `git pull origin main`），仅正文叙述使用上述映射。

### 3.3 规则三：所有内部推理与工具调用输出也必须用中文

所有内部思考、推理、分析、设计、比较、逻辑推演及工具调用过程与输出，一律使用中文，严禁纯英文或中英文混合；一旦检测到英文或中英混用，必须立即纠正为中文重述。本规则覆盖**全部会话、优先于任何默认语言习惯**，与规则二互补：规则二约束"最终答复"，规则三约束"过程与中间产物"。

### 3.4 规则四：结论必须唯一

同一事项**只输出一份权威结论**。当多轮分析、多份报告、多个信息源之间出现分歧时，必须先裁决、后交付：以证据强弱定优先级，显式标注"以哪一版为准、旧版为何作废"，然后**只呈现裁决后的那一版**。

- **禁止**把 A 版与 B 版并列丢给用户让其自行取舍；禁止用"也可能是……"回避裁决。
- 无法裁决时，明确说明**卡在哪个待验证事实**上，并给出验证该事实的具体动作——而不是并列多版。
- 本规则约束"工作产出"（分析 / 审查 / 排错 / 方案报告）；文件头声明的"单一事实源"约束"记忆文件自身"，二者同源互补，不重复定义。

---
# 第二篇：本地环境与工具链

> 本篇定义本地操作的基础环境：目录结构、工具位置、动态能力入口。所有路径与工具位置仅在此定义，其余章节引用，不重复。

## 第6章 目录与工具链约定

> 「本地工具链与 UV 管理规范」，作为本地一切操作的统一基准。**⚠️ 本章路径为本机（Windows 11 / D: 盘）环境事实，仅对本机通用；迁移机器须整体更新，勿当跨机通用规则。**

### 6.1 目录根约定

| 名称 | 默认路径 | 用途 |
| ------ | ------ | ------ |
| Skill 技能根目录 | D:\Documents\AI_MCP-Skill-CLI | 所有 Skill 资产（[SKILL.md](http://SKILL.md)、脚本、资源、模板）存放根；该目录本身也是用户的一个 GitHub 仓库/项目（独立 git 仓库）。用户指定绝对路径则直接用，相对路径解析为 [Skill 技能根目录]/[相对路径] |
| GitHub 仓库根目录 | D:\Documents\AI_Work_Temp | 所有本地仓库/GitHub 代码/资产存放根；均为其一级子目录。⚠️ 根目录本身「不是」GitHub 仓库/项目，绝不可对根目录执行 git init 或任何 git 操作；每个仓库是独立一级子目录（如 D:\Documents\AI_Work_Temp\Deepseek-pp），.git 只存在于各子仓库目录内，根目录无 .git。用户指定绝对路径则直接用；相对路径/仓库名解析为 [GitHub 仓库根目录]/[相对路径或仓库名]；否则以自然语言询问用户 |
| 临时目录 | D:\System\UserTemp | 下载缓存、数据缓存、程序缓存（构造的 .py 等）的父目录 |
| Tool 和 CLI 存放根目录 | D:\Tools\Assembly | 所有工具 Tool 与 CLI 存放根 |

### 6.2 本地工具安装位置（适用于 Windows 环境）

| 工具 | 安装目录 | PATH 注册（where.exe 实测 |
| ------ | ------ | ------ |
| Node.js + npm | D:\Tools\Assembly\nodejs | （全局安装铁律见 `### 6.3 严格优先规则`） |
| UV | D:\Tools\Assembly\uv | ✅ |
| Git | D:\Tools\Assembly\git | ✅ |
| GH | D:\Tools\Assembly\gh.exe | ✅ |
| Officecli | D:\Tools\Assembly\officecli.exe | ✅ |
| WMIC | D:\Tools\Assembly\WMIC.exe | （见 `### 6.3 严格优先规则`） |
| PECMD | D:\Tools\Assembly\PECMD.exe | （见 `### 6.3 严格优先规则`） |
| Python | D:\Tools\Assembly\python\cpython-3.14.5-windows-x86_64-none（由 UV 管理使用） | ✅ |
| ffmpeg（转码/处理） | D:\Tools\Assembly\ffmpeg\ffmpeg.exe | （见 `### 6.3 严格优先规则`） |
| ffprobe（信息分析） | D:\Tools\Assembly\ffmpeg\ffprobe.exe | （见 `### 6.3 严格优先规则`） |
| ffplay（音视频播放） | D:\Tools\Assembly\ffmpeg\ffplay.exe | （见 `### 6.3 严格优先规则`） |

> **PATH 注册与安装要点**：
>
> - `uv` / `python` / `git` / `gh` / `officecli` 经 `where.exe` 实测，在**系统 PATH 与用户 PATH 双通道**均可解析（✅）；其余工具均位于 `D:\Tools\Assembly` 并在 PATH。
> - **Git 双可执行文件等价**：`git\cmd\git.exe` 与 `git\bin\git.exe` 为同一文件（MD5 `0857b8b97b665e9602d080543a11519c`、均 46480 字节、均报 `git version 2.54.0.windows.1`），统一以 `cmd\git.exe` 为单一事实源；`git\bin` 另含 bash/sh/ls/grep/sed/awk 等 unix 工具。
> - **Python 解释器不在裸 PATH 调用**：`myenv` 的 `.venv\Scripts\python.exe` **不**在 PATH；Python 一律经 `uv run --project D:\Tools\Assembly\python\myenv` 调用。

### 6.3 严格优先规则

- **必须优先使用** `D:\Tools\Assembly` 下的工具：`nodejs`、`uv`、`git`、`gh.exe`、`officecli.exe` 等。
- **仅当** `D:\Tools\Assembly` 中工具不可用或使用失败，才回退至内置同用途工具。
- **PATH 注册结论**：上述工具在 **系统环境变量 PATH** 与 **用户环境变量 PATH** 均已注册，`where.exe` 均可解析。因此 **WorkBuddy 的"内置运行时"（内置 Git Bash / 内置 Python / 内置 Node.js）可安全关闭**，不依赖任何内置运行时即可工作。
- **关闭内置 Git Bash 的影响**：Git / GitHub CLI 完全无影响（`git`、`gh` 走系统 PATH）；因 `D:\Tools\Assembly\git\bin` 在 PATH，`bash`/`sh` 及 unix 工具（ls/grep/sed/awk 等）仍可从 PATH 解析，bash 风格命令与 `.sh` 脚本通常仍可用。唯一需观察的边界：若 WorkBuddy 的 Shell 工具硬编码调用内置 bundled bash 而非从 PATH 探测 `bash`，可能回退到 `cmd`/`PowerShell`；如发生，重新开启内置 Git Bash，或确认 `D:\Tools\Assembly\git\bin` 在 PATH 靠前位置即可。
- **关闭内置 Python**：我执行 Python 仍走 `uv run`（见 UV 硬约束），只要 `uv` + 解释器在 PATH 即工作；本机 `python` 已在 PATH，WorkBuddy 本体若有 Python 调用也改走系统 PATH，故可用。
- **关闭内置 Node.js**：需保证 `D:\Tools\Assembly\nodejs` 在 PATH（记忆已登记该路径）；本机 Node 由该路径提供。
- **通用建议**：可关闭内置运行时以"用本机工具"，但建议保留内置运行时作为兜底，或在关闭后实测 `git --version` / `gh --version` / `uv --version` / `python --version` / `node --version` / `officecli --help`；若某项失效，先确认对应 `D:\Tools\Assembly` 路径仍在 PATH，必要时重开内置运行时。

---

## 第7章 git/gh 工具与认证

> 依据本机已验证环境：`D:\Tools\Assembly\gh.exe`（已登录 `zhangweildlh`；scopes 含 `repo`/`workflow`/`admin:org`）。✅ = 本会话已实跑验证。

### 7.1 git / gh 本地路径

- **git 本地路径**：`D:\Tools\Assembly\git\cmd\git.exe`，负责本地版本控制（diff 自审、分支、commit、rebase、push/pull、force-push）；`cmd\git.exe` 与 `bin\git.exe` 为同一文件，统一以 `cmd\git.exe` 为单一事实源。
- **gh 本地路径**：`D:\Tools\Assembly\gh.exe`，负责 GitHub 平台交互（仓库/PR/Issue/CI/Release/API 等）。

### 7.2 凭证助手桥接

- `https://github.com` 与 `https://gist.github.com` 走 `gh auth setup-git` 桥接（复用 gh 登录令牌，自动续期、权限含 repo/workflow/admin:org）；
- 其余托管走全局 `wincred`（Windows 凭证管理器）。
- 第三方电脑装好 gh 并 `gh auth login` 后即可复用；移植 GitExtensions 时只需重跑 `gh auth setup-git`（或复制 `D:\Tools\Assembly` 整树到相同盘符）。

### 7.3 连接器说明

- 非 GitHub 类 MCP（ima/kdocs/tencent-docs 等）按各自状态使用，与 GitHub 工具链无关；
- 若 `mcp__github__*` 连接器 connected，仅作非必需备份（其 App 令牌在非自有仓库建 PR/Issue 会 403，故标准流程不采用 gh 之外的通道）。

### 7.4 能力边界（重要）

| gh 不能做 | 归属 |
| ------ | ------ |
| 本地提交/暂存/分支切换/rebase/diff（工作区） | 归 git（本地动作） |
| 编译、运行、测试代码 | 归 CI（gh run）或本地工具链 |
| 渲染 Markdown 为网页（导航/图片/样式） | 仅取原始文本，渲染需 Web |
| 直接读取非默认分支被代码搜索索引的内容 | 代码搜索仅索引默认分支 |
| 修改他人仓库（无写权限时） | 只读；改动须走 Fork+PR |
| gh api repos///tags 默认分页（常仅返最新 ~30 个标签） | 核对标签全集差集须用 git ls-remote --tags （无分页），勿凭 gh api tags 单页推断"本地独有/缺失"——已因此误判 auto-*/v0.2-v0.5 为杂标签险些误删（某 fork 仓库实证） |

---
# 第三篇：账户与身份

> 本篇定义 GitHub 账户信息、Fork 仓库清单与工具认证配置。

## 第8章 账户信息

### 8.1 用户名与邮箱

- 用户名：`zhangweildlh`
- 邮箱：`157947621@qq.com`

### 8.2 Fork 仓库清单（账户资产索引）

> ⚠️ 此清单为**账户资产索引**，会随实际 fork / 删库 / 新增而变动，**以 `gh repo list` 实时为准**，勿当永久事实。各 fork 的**个性化协作规则不在此列**——凡某 fork 专属的操作约束、当前状态、隐私项策略，一律记录在该 fork 自己的项目级记忆（`D:\Documents\AI_Work_Temp\<仓库>\.workbuddy\memory/MEMORY.md`），本跨项目记忆只沉淀通用方法。

| 仓库 | Fork 地址 | 上游仓库(upstream) | 备注 |
| ------ | ------ | ------ | ------ |
| dynamic-mcp | [https://github.com/zhangweildlh/dynamic-mcp](https://github.com/zhangweildlh/dynamic-mcp) | asyrjasalo/dynamic-mcp | 标准 Fork |
| mcp-bridge | [https://github.com/zhangweildlh/mcp-bridge](https://github.com/zhangweildlh/mcp-bridge) | mimicode/mcp-bridge | 标准 Fork |
| chrome-md-editor | [https://github.com/zhangweildlh/chrome-md-editor](https://github.com/zhangweildlh/chrome-md-editor) | yishu-ziyu/chrome-md-editor | 标准 Fork |
| deepseek-pp | [https://github.com/zhangweildlh/deepseek-pp](https://github.com/zhangweildlh/deepseek-pp) | zhu1090093659/deepseek-pp | 标准 Fork |
| we-mp-rss | [https://github.com/zhangweildlh/we-mp-rss](https://github.com/zhangweildlh/we-mp-rss) | rachelos/we-mp-rss | 私人化定制 Fork（专属协作规则见其项目级记忆，不在此重复） |

---

# 第四篇：模块

> 本篇收纳被多个工作流引用的「模块」。

## 第9章 gh 能力速查

> 本章为 `gh` CLI 的完整命令清单与功能速查。

### 9.1 认证与配置

| 命令 | 作用 |
| ------ | ------ |
| gh auth login / logout / status / refresh / switch | 登录/退出/查看/刷新/切换账号 |
| gh config get / set | 读写 gh 配置（默认编辑器、git protocol 等） |
| gh auth setup-git | 桥接令牌到 git credential（本机 credential.helper 为空时 git push 需此） |

### 9.2 仓库管理（《gh repo》）

| 命令 | 作用 |
| ------ | ------ |
| gh repo view [owner/repo] | 查看仓库元信息（描述、语言、星标、README 文本）✅ |
| gh repo clone | 克隆仓库（等价于 git clone，自动用 gh 协议） |
| gh repo fork | Fork 到本人账号（标准流程阶段 1 前置） |
| gh repo create | 新建仓库（private/public/desc） |
| gh repo list | 列出当前账号/组织的仓库 |
| gh repo sync | 将 fork 与 upstream 同步 |
| gh repo rename / delete / archive / unarchive / edit | 仓库维护操作 |

### 9.3 Pull Request（《gh pr》）

| 命令 | 作用 | 对应流程阶段 |
| ------ | ------ | ------ |
| gh pr create | 开 PR（–repo/–base/–head/–title/–body/–body-file） | 阶段 2 |
| gh pr list / view | 列出/查看 PR | 全阶段 |
| gh pr checks | 查看 PR 的 CI 状态（轮询） | 阶段 2/3 |
| gh pr diff | 查看 PR 差异 | 阶段 2 自审 |
| gh pr review | 提交 review（approve/request-changes/comment） | — |
| gh pr merge | 合并 PR（自有仓库/自测 PR 用） | 阶段 4 |
| gh pr checkout | 拉取 PR 到本地分支 | 阶段 5 |
| gh pr comment / close / reopen / edit | PR 互动 | — |

### 9.4 Issue 跟踪（《gh issue》）

| 命令 | 作用 |
| ------ | ------ |
| gh issue create / list / view | 建/列/查 Issue |
| gh issue close / reopen / comment / edit / delete | Issue 维护 |
| gh issue status | 查看与本人相关的 Issue/PR 总览 |

### 9.5 全站搜索（《gh search》）

| 命令 | 作用 | 验证 |
| ------ | ------ | ------ |
| gh search repos “” [–language --stars --owner] | 搜仓库 | ✅ 返回全球公开仓库 |
| gh search code “” [–repo --language] | 搜代码（仅默认分支） | ✅ 返回跨文件命中行 |
| gh search issues “” | 搜 Issue | 可用 |
| gh search prs “” | 搜 PR | 可用 |
| gh search commits “” | 搜提交 | 可用 |

### 9.6 原生 API 访问（《gh api》）

- 调用任意 GitHub REST 端点：`gh api repos/<owner>/<repo>/contents/<path>` 读文件、`gh api user` 看本人信息。
- 支持 GraphQL：`gh api graphql -f query='...'`（分支保护即用此）。
- 常用选项：`-H` 自定义头、`-F` 参数、`-q` jq 过滤、`--silent`、`--hostname`（GitHub Enterprise）。
- REST 搜索等价：`gh api "/search/repositories?q=..."`。✅ `gh api repos/<owner>/<repo>/contents/<path> -q .content` 返 base64（需解码得到文件内容）。

### 9.7 CI/CD（《gh run》 / 《gh workflow》）

| 命令 | 作用 | 对应流程 |
| ------ | ------ | ------ |
| gh run list | 列出 workflow runs | 阶段 2/3 轮询 |
| gh run view / watch | 查看/等待 run 完成 | 阶段 2/3 |
| gh run rerun / cancel | 重跑/取消 | — |
| gh run download [–log/–log-failed] | 下载日志（排错） | CI 失败时 |
| gh workflow list / view / run / enable / disable | 管理工作流（fork 启用 Actions 后） | 工作流六 CI 失败排错（`## 第18章 工作流六 CI 失败排错`）/ 工作流七 Release 发版（`## 第19章 工作流七 Release 发版`）/ 模块·Fork CI 实证要点（`## 第12章 Fork CI 实证要点`） |

### 9.8 发布与制品（《gh release》）

| 命令 | 作用 |
| ------ | ------ |
| gh release create | 基于 tag 发布 Release |
| gh release upload / download | 上传/下载附件（构建产物） |
| gh release list / view / delete / edit | Release 维护 |

### 9.9 代码片段（《gh gist》）

`gh gist create` / `list` / `view` / `edit` / `delete` —— 管理 Gist 文本片段（贴配置、报错）。

### 9.10 密钥与变量（《gh secret》 / 《gh variable》）

| 命令 | 作用 |
| ------ | ------ |
| gh secret set / list / get / remove | 仓库/组织/环境级加密密钥（CI 用） |
| gh variable set / list / get / delete | 非机密变量（CI 用） |

> 写密钥通常需 `read:org`/`admin:org` scope（本机令牌含 `admin:org`，可用）。

### 9.11 标签 / 项目 / 规则集

| 命令 | 作用 |
| ------ | ------ |
| gh label create / list / clone / edit / delete | Issue/PR 标签管理 |
| gh project list / view / item-add / … | Projects V2（beta） |
| gh ruleset list / view / check / create / update / delete | 分支保护规则集（需相应权限） |

### 9.12 扩展与定制

| 命令 | 作用 |
| ------ | ------ |
| gh extension install / list / create / remove / upgrade | 安装社区扩展 |
| gh alias set / list / delete / import / export | 命令别名 |
| gh completion | 生成 shell 自动补全 |

### 9.13 其他

- `gh codespace ...`：Codespaces 生命周期管理（create/ssh/code/cp/delete）。
- `gh copilot ...`：交互式 Copilot（explain/suggest，gh 2.49+）。
- `gh attestation verify`：SLSA 制品来源校验。
- `gh billing ...`：查看 Actions/Packages/Storage 用量（需 admin 权限）。
- `gh status`：概览与本人相关的 PR/Issue。
- 统一输出格式：`--json <fields>` + `-q <jq>` 或 `-t <go-template>`，便于脚本化过滤。

---

## 第10章 路径核验

> **本规则优先级高于一切便利与"少问多做"。**
>
> **⚠️ 强制绑定：每一个 GitHub 管理流程（日常同步巡检 / 标准代码修改 / CI 排错 / Release 发版 / 分支清理回收 / 信息读取与搜索 等）的第一步都必须是路径核验，未核验路径不得进入任何后续步骤。**

### 10.1 规则一：先核验"要操作的目录"再动手

- 任何任务启动、切换仓库、或执行 `git`/`gh`/文件读写前，**先用命令确认当前要操作的目录到底是什么**（如 `git rev-parse --show-toplevel`、`pwd`/`cd` 确认、`ls` 看一级子目录结构）。
- 仓库目录 = `[GitHub 仓库根目录]/[仓库名]`（如 `D:\Documents\AI_Work_Temp\<仓库名>`）。**绝不**对 `[GitHub 仓库根目录]`（即 `D:\Documents\AI_Work_Temp`）本身执行 `git init` 或任何 git 操作——它是根，不是仓库。
- Skill 相关操作目录 = `D:\Documents\AI_MCP-Skill-CLI`。

### 10.2 规则二：路径核验的正确命令写法

> 实测根因：`git -C /d/...`（Unix 风格根路径）在 Git Bash 下**会被 git 误报 `fatal: not a git repository`**（exit=128），但 `git -C "D:/..."`（Windows 盘符+正斜杠）与 `cd /d/... && git` 均成功（exit=0）。此外，在"非仓库的当前目录"直接执行 `git rev-parse --show-toplevel` 也必然误报。两类误报曾反复触发"路径异常暂停"假警报，须从命令写法上根治。

- **推荐核验顺序（三步，任一成立即可判定为有效仓库）**：

1. 先 `ls "<目录>/.git"` 确认 `.git` 目录存在（最直接、零歧义，不受路径格式影响）；
2. 再用 `git -C "D:/绝对/Windows/路径" rev-parse --show-toplevel`（`D:/` 盘符格式）确认仓库根；
3. 或 `cd /d/绝对/路径 && git rev-parse --show-toplevel`（先切换目录再执行，最稳）。

- **禁止的写法（会误报，严禁用于路径核验）**：
- ❌ `git -C /d/Documents/...`（Unix 风格 `/d/` 根路径传给 git 的 `-C`）——实测必误报；
- ❌ 在"非目标仓库的当前目录"直接 `git rev-parse --show-toplevel`（如工作区根 `2026-07-24-12-15-10`、临时目录）——必然误报。
- **误报判定铁律**：`git rev-parse` 返回 `fatal: not a git repository` 时，**先怀疑路径格式 / 当前目录错误，绝不直接判定"该目录不是 git 仓库"**；必须先 `ls "<目录>/.git"` 复核，确认 `.git` 真实不存在后才可下结论。

### 10.3 规则三：任务记忆/工作日志必须记录"操作目录"

- 每一个新任务，须在**任务记忆（workspace memory）和任务工作日志（[YYYY-MM-DD.md](http://YYYY-MM-DD.md)）**中明确写清：
- 项目/仓库文件夹路径（绝对路径）；
- 用户经常操作的文件夹路径（如根目录、Skill 目录、临时目录）；
- 本次将读写/修改的具体目录与文件。
- 未记录路径就开始执行步骤，视为违规。

### 10.4 规则四：发现异常先问，对齐后再做

- 一旦发现路径异常（如 `git rev-parse --show-toplevel` 指向的不是预期仓库目录、根目录意外出现 `.git`、工作区文件出现在错误层级），**立即暂停，先问用户**，大白话说明发现了什么。
- **先排除"路径格式误报"再判定异常**：`git rev-parse` 报 `not a git repository` 时，**第一动作必须是 `ls "<目录>/.git"` 复核**；确认 `.git` 不存在才视为真异常并触发暂停。若 `.git` 存在，则是命令路径格式问题（见 `### 10.2 规则二：路径核验的正确命令写法` 规则二），改用正确写法重测，**不得据此触发"路径异常暂停"**，也不向用户发"路径核验关键异常"类告警。
- **只有与用户明确一致"要操作的文件夹路径"后，才能继续讨论工作流程、操作步骤和下一步内容。** 绝不绕过路径对齐直接进入执行。

---

## 第11章 提交前文档同步门禁

> 核心要求：每次向 GitHub 提交(commit)代码或文件前，必须基于本次仓库代码与文件的"真实变化"（以 `git status` / `git diff` 实际改动为准，**严禁凭空臆测**），按「改动类型 × Tier 1/2/3 分层检查清单」检查仓库内相关文件是否需要同步更新，确保"仓库日志记录"与"代码/文件变化"一致。
> 文档同步属「文档代码同改」一环：改动前先确立全局契约面（覆盖到哪、不覆盖到哪、剩余边界为何），避免「文档过度承诺、代码覆盖不全」或反向错位。
>
> 清单的权威定义见 `github-personal-manager` 技能的 `references/docs-sync-checklist.md`；检测由技能脚本 `sop_docs_sync_check.sh` 落地、由智能体基于结果实际改文档。
>
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）。**

### 11.1 分层模型与处理语义

| 层级 | 内容 | 处理语义 |
| ------ | ------ | ------ |
| Tier 1（阻断） | 根 README / README_EN / CHANGELOG | 仓库门面与版本记录。存在但未纳入变更 → 必须先补文档再提交(commit)（脚本 exit 2） |
| Tier 2（强建议） | docs/、CONTRIBUTING、配置样例、接口契约、i18n、examples | 存在但未纳入变更 → 提交(commit)前须处理，或显式说明为何不改；脚本加 --strict 可同样阻断 |
| Tier 3（提示） | 测试、包清单、锁文件 | 行为/依赖变动建议补测试或同步锁文件，仅提示不阻断 |

### 11.2 适用范围

- **触发**：凡走「标准代码修改工作流程」阶段 2 的 `git commit`（新增/修改/删除代码或文件，产生真实变化），提交(commit)动作前必须先过本门禁。
- **免触发**：① 本次仅改动文档本身（如只改 README/CHANGELOG/docs，无代码/文件真实变化）；② 仓库管理类动作（日常同步巡检的 merge、Release 打标签、分支清理回收）不产生新代码变化，不强制再写文档——避免无意义循环更新。

### 11.3 执行流程（查询 → 分析 → 需改先改 → 提交 → 推送）

> **前置约束（依赖 github-personal-manager 技能）**：第 3 步的 `bash scripts/sop_docs_sync_check.sh` 与 `references/docs-sync-checklist.md` 由 `github-personal-manager` 技能提供。**须先激活该技能、在其技能目录下执行脚本**；若未激活技能，改用等价人工自审：直接基于 `git diff`/`git status` 真实变化，人工核对 Tier 1/2/3 文件是否同步，结论须与脚本一致。

1. **取真实变化**：以 `git status` / `git diff`（含已暂存 `--cached` 与未暂存）/ `git ls-files --others` 实际改动为准，**严禁凭空臆测**哪些变了。
2. **推导改动类型**：脚本按真实变化文件自动判定（命令/配置/功能/接口/依赖/重命名/行为/文案/示例/文档；无法判定则保守触发全部 Tier 2）。
3. **查仓库是否存在清单文件并分析同步状态**：运行 `bash scripts/sop_docs_sync_check.sh <仓库路径>`（技能内脚本，只读 dry-run，依据 `references/docs-sync-checklist.md` 数据块）——它查仓库是否存在清单文件、对存在文件核对是否已纳入本次变更，输出分层明细（`【Tier 1｜阻断】` / `【Tier 2｜强建议】` / `【Tier 3｜提示】`）与 `【文档同步状态】已同步 / 未同步`。
4. **需改则先改再提交(commit)**：

- Tier 1 未同步 → 必须先基于真实变化更新 README/README_EN（命令·配置·依赖·接口·功能·目录结构等）与 CHANGELOG（功能性/可见行为变化在顶部追加条目），并把文档一并 `git add` 进同一次提交(commit)。**严禁在 Tier 1 未同步时直接 `git commit` 代码。**
- Tier 2 未同步 → 按改动类型定位相关文件（功能/接口改动查 docs/ 与契约、文案改动查 i18n、示例改动查 examples），需更新则一并 `git add`；若判断无需改，须显式说明。
- Tier 3 → 仅作提示，按需补测试/同步锁文件。

1. **已同步 / 无真实变化 → 正常继续**：按标准流程提交(commit)、推送(push)、开 PR。

### 11.4 与现有规则关系

- 本门禁**不绕过**任何顶级全局禁令 / 二次显式授权铁律 / 路径核验硬规则。
- 它只是"提交(commit)前的一道文档—代码一致性闸门"；与「标准代码修改工作流程」阶段 0 闸门（完整性/正确性/静态校验）并列、互补。
- 清单维护：增删同步文件或调整分层，只改 `references/docs-sync-checklist.md` 的「权威检查清单数据块」与「改动类型 → 应同步文件 映射表」，并同步 `sop_docs_sync_check.sh` 的回退清单与 [SKILL.md/本记忆的引用。](http://SKILL.md/%E6%9C%AC%E8%AE%B0%E5%BF%86%E7%9A%84%E5%BC%95%E7%94%A8%E3%80%82)

---

## 第12章 Fork CI 实证要点

> 本模块记录 Fork 仓库 CI 实操中独有的坑与专属约束，作为第五篇 GitHub 标准工作流中 CI / 发版类（工作流六/七）实操坑的实证溯源；已抽离账户名/邮箱，**统一用占位符 `<upstream>`/`<fork>`/`<feat>`/`<version>` 与「某仓库/某版本」表述**，确保可移植。涉及具体语言的坑（Rust/Node 等）已标注适用语言，不具备跨语言通用性。各主流程工作流已以「详见模块·第12章第 X 点」单向指向此处。

1. **默认使用 GitHub Actions CI 构建**；禁止在本地安装任何编译工具链（MSVC Build Tools、MinGW 等）。若仅用本机已有工具/程序（不安装新工具）即可完成编译，则允许本地编译（本地编译仅限使用本机已安装且已在 PATH 注册的工具，不安装新工具链）。
2. **Fork 仓库的 GitHub Actions 默认未启用**，需用户在浏览器手动启用（点 “I understand my workflows, go ahead and enable them”）。
3. **启用 Actions 后，通过删除并重新推送标签触发工作流**：`git push origin :refs/tags/v1.x.x` → `git push origin v1.x.x`（**非强推**）。
4. **创建 PR/Issue 统一用 `gh` CLI**（用户令牌免 403）；Web UI 仅兜底。

### 12.1 关键问题与解决

1. **Fork→上游 PR 卡 `action_required`（fork PR 审批闸门）**：仅上游有写权限者可 Approve and run，作者无法自批；审批前上游 CI 不跑。→ 等维护者；验证改 fork 内部路径。
2. **Fork 内部 PR（base=fork main）不触发 `pull_request` workflow**（GitHub 固有）。→ 改用 `ci.yml` 的 `push:[main]`：把 `feat` 以 merge commit 合到 fork main 再 `git push origin main`（临时验证合并，事后精确恢复，见第3点）。
3. **临时验证后精确恢复 fork main（禁止强推 main）**：`git checkout main` → 在 功能分支(feat) 复现目标状态 → 开同源内部 PR(base=fork main) → 合并(merge) 即更新 main，无需强推。⚠️ 原步骤 `git push --force-with-lease origin main` 属强推 main，违反跨项目「禁止强推/删除自家 main」硬禁令，绝不可再用；改用下文的「合并即更新 main」路径。
4. **Fork main 与 feat 重复实现致 merge 冲突**：`git checkout --ours <file>` 保留已验证版本（feat 自身改动仍完整，将来合上游不冲突）。
5. **构建二进制（不仅是验证）**：Release 工作流 `on: push: tags: ['v*']` → `git tag -a v<version>` + `git push origin v<version>` 触发；产物作 release assets（含 Windows 二进制）。
6. **⚠️ 禁用发布类 job（关键，Rust/Python 等可发布包的项目适用）**：fork 的 `release.yml` 常含 `publish-to-crates-io`/`pypi`/`build-python-wheels`——fork 绝不能发布。给这些 job 加 `if: github.repository == '<upstream>'` 守卫（fork 上 false 跳过、上游上 true 发布），保留 `create-release` + `build-release`（PR 来自 feat 分支，release.yml 不在其 diff 内，不影响上游 PR）。⚠️ 勿用纯常量 `if: false`——actionlint 报 `constant expression "false" in condition` 会直接判 CI 失败。
7. **CHANGELOG 需有对应版本段**：`create-release` 用 `awk "/^## [<ver>]/"` 抽 notes；无段回退 `--generate-notes`，文件不存在才 awk 失败。顶部加 `## [X.Y.Z] - <date>`。
8. **勿勾 “Require actions to be pinned to a full-length commit SHA”**：`ci.yml`/`release.yml` 用 tag 引用 action（`actions/checkout@v4`）时勾选必败（整 CI 红）。
9. **clippy 坑（`-D warnings` 必查）**：如 `clippy::useless_conversion`（`serde_json::Value::Object(map.into())` 中 `map` 已是 `JsonObject`，`.into()` 为 identity）。修复提交到 **feat 分支**并 `git push origin feat`，重做验证。
10. **rustfmt 关卡（`cargo fmt -- --check`）**：可装 minimal toolchain + 仅 rustfmt 组件（只解析语法、不编译、不需链接器）做精准格式化；或靠临时 push-to-main CI 间接确认。手写多行调用会被 rustfmt 折叠，是主要风险点。
11. **CLI flag 重命名 / clippy 踩坑（某版本实证，Rust 项目）**：合并 `--http-host/--http-port/--http-path` 为 `--http-endpoint` 时连踩两处 CI 错误，根因都是「只改了一部分、没全仓扫」：

- **改函数签名为 `&str` 后必须同步改全部下游 `&param`**：`check_singleton` 内 `format!(...)` 改直接用 `endpoint: &str` 参数，函数体内 4 处 `&endpoint`→`endpoint` 改了，却漏 `try_acquire_lock(&endpoint, …)`（[singleton.rs:518](http://singleton.rs:518)），被 `clippy::needless-borrow` + `-D warnings` 升级为 CI 错误。
- **重命名 CLI flag 必须全仓 grep 旧 flag 字符串**（含 `tests/`/`examples/`/`README*`）：只改 `tests/singleton_cli.rs` 的 L19-20，漏 L47-48 的另一个 `--http-port`，导致 Test 任务用已删除的旧参数启动二进制而失败。
- **本地只跑 `cargo fmt --check` 预过 fmt 门；clippy 原则交 CI**（clippy 需 Rust 工具链，默认不本地跑；若本机已预装且可用则可本地跑）。
- **覆盖含未提交改动的文件前先 `git diff origin/main -- <file> > /tmp/<file>.bak.patch` 存补丁**——本次 README 误覆盖靠这条恢复（恢复时基底提交必须与生成补丁时的 origin/main 一致，否则 apply 失败；详见项目级记忆同款记录）。

12. **用 gh 开启分支保护（2026-07-15 实测）**：`gh api graphql -F query=@-`（heredoc 喂 mutation）调用 `createBranchProtectionRule`。关键字段：`repositoryId`（用 `gh api repos/<owner>/<repo> -q .node_id` 取）、`pattern:"main"`、`requiresStatusChecks:true` + `requiredStatusCheckContexts:[...]`（精确匹配 CI 检查名，matrix 会产生 `Build (ubuntu-latest)` 等多条）、`requiresStrictStatusChecks:true`、`allowsForcePushes:false`、`allowsDeletions:false`、`isAdminEnforced:false`（即不开启 Do not allow bypassing，管理员/AI 可紧急绕过）、`requiresApprovingReviews:false`。⚠️ **API 无法表达「要求 PR + 0 审批」**：REST 的 `required_approving_review_count` 最小为 1，GraphQL 无独立 `requiresPullRequest` 字段；故以「CI 绿 + 禁强推 + 禁删 + 管理员可绕过 + 无审批」为最大化可达保护。注意 `gh api graphql` 默认会跑 schema 自检，必须用 `-F query=@-` 从 stdin 喂查询才会真正执行。

### 12.2 约束 / 注意事项（fork 专属硬规则）

- `git push` 只推 origin（fork），绝不推 upstream。
- 上游合并由维护者完成，助手不自行合并。
- 不本地安装任何编译工具链（MSVC Build Tools / MinGW-w64 等）；但若本机已预装并可用（如 Rust toolchain / GCC 已在 PATH），可复用其进行本地编译。
- `gh pr close <n>` 无 `-y`/`--yes` 标志（误用报 `unknown flag`）。
- 临时验证合并可能被 GitHub 自动标为某 PR merged（检测到 head 已合入 base），正常，无需处理。
- 工作流权限：fork Settings→Actions→Workflow permissions 需 Read and write（`gh release create` 要 `contents: write`）；CI 本身只需读权限。

---

# 第五篇：GitHub 标准工作流

> **⚠️ 路径核验（ `## 第10章 路径核验`）是最高优先级硬规则：每个工作流启动阶段的第一步都必须是路径核验，未核验路径不得进入任何后续步骤。**

## 第13章 工作流一 github-personal-manager 自动激活（GitHub 工作流总闸门，前置）

> 用户明确要求：把"`github-personal-manager` 技能自动激活"加入常驻记忆。凡涉及 GitHub 仓库/项目/代码操作的任务，主 Agent 必须在动手前先判断是否已激活该技能。
>
> 本规则作为 GitHub 工作流总闸门，逻辑上前置（位于路径核验等模块/工作流章节之前）。第五篇各工作流在启动前均须先激活本技能。

### 13.1 激活判定

在动手做任何 GitHub 相关操作之前，先判断本次任务是否涉及 GitHub 仓库/项目/代码——包括但不限于：提交(commit)/推送(push)/开 PR、同步(origin↔upstream)、CI 失败排错、Release 发版、分支清理回收、读取/搜索 GitHub 仓库或代码、读写本地 GitHub 仓库目录。若涉及，先激活 `github-personal-manager` 技能，再按它的 `SKILL.md` 执行。

### 13.2 激活动作

- 通过所在平台的技能系统**按名称 `github-personal-manager` 解析并加载**该技能。各平台技能存放路径各不相同（可能因 `~/.workbuddy/skills/`、`{workspace}/.workbuddy/skills/`、或其他自定义目录而异），**一律以平台自身的技能解析机制按名加载；绝不在记忆/提示词里写死任何绝对安装路径**（如 `C:/Users/<用户名>/.workbuddy/skills/...`）。
- 加载后**严格遵循该技能 `SKILL.md` 的指令与脚本调用约定**：脚本一律用相对路径调用（如 `bash scripts/sop_sync_precheck.sh <参数>`），以技能主文件 `SKILL.md` 所在目录为根解析；不自行猜测或改写脚本内部逻辑。
- 技能内部已具备"路径无关"能力：资源/脚本用相对路径自定位、git/gh 走 `where.exe` 运行时解析、仓库三元组(GH_USER/REPO_NAME/UPSTREAM)从 `git remote -v` 提取——这些都不依赖安装位置。因此记忆只需引用技能**名称**即可，无需关心它装在哪、也不需要在记忆里复述脚本路径。

### 13.3 能力覆盖范围

该技能是 GitHub 个人操作的统一执行入口，覆盖「信息读取与搜索 / 日常同步巡检 / 标准代码修改 / 多工作树并行开发 / CI 失败排错 / Release 发版 / 分支清理回收 / PR 全生命周期 / 清理工区」等第五篇全部 GitHub 工作流（其中自动激活为本总闸门自身）；凡上述场景优先走该技能，而非手工拼 git/gh 命令。**各工作流章节已统一标注"启动前必须先完成路径核验"，即本门禁的落地**。

### 13.4 与现有 GitHub 规则的关系

本记忆各「工作流」章节给出"为什么、有什么约束"，`github-personal-manager` 技能给出"具体跑哪个脚本、怎么跑"的可执行实现；两者一致、互不矛盾——执行 GitHub 操作时以"本记忆的约束 + 技能的脚本"组合落地。

### 13.5 门禁仍生效

激活该技能**不绕过**任何顶级全局禁令 / 二次显式授权铁律 / 路径核验硬规则；技能自带的 dry-run(`--confirm` 二次门禁)、冲突暂停、仓库三元组解析等机制照常遵守。

### 13.6 激活后执行点索引

激活技能后，按下列「工作流 → 执行脚本」索引直接落地；脚本一律用**相对路径**（以技能 `SKILL.md` 所在目录为根）调用：`bash scripts/sop_*.sh <参数>`，**写操作默认 dry-run，追加 `--confirm` 才真正执行**。所有脚本清单与参数详见技能 `SKILL.md` 的「核心工作流」与各工作流步骤。

- **工作流一 · github-personal-manager 自动激活（总闸门）**：本索引所属章节自身；凡涉及 GitHub 操作先激活本技能再进入后续工作流。
- **工作流二 · 信息读取与搜索（gh 优先）**：无专属脚本，按 `references/gh-capability.md` 的 `gh` 命令清单执行；仅当 `gh` 不可用才回退 WebFetch/WebSearch。
- **工作流三 · 日常同步巡检**（本地 ↔ 你的远端仓库(origin) ↔ 上游仓库(upstream)）
- `scripts/sop_sync_precheck.sh <仓库路径>`（只读·看状态）
- `scripts/sop_sync_pull_ff.sh <仓库路径> [--confirm]`（本地↔origin，快进）
- `scripts/sop_sync_upstream.sh <仓库路径> [--confirm]`（origin↔upstream 决策树）
- `scripts/sop_sync_report.sh <仓库路径> <合并前tip>`（只读·上游更新分析报告）
- **工作流四 · 标准代码修改**（改/写代码、提交、推送、开 PR）
- `scripts/sop_docs_sync_check.sh <仓库路径> [--strict]`（只读·提交前文档同步门禁，对应第四篇模块「第11章」）
- `scripts/sop_pr_create.sh <仓库路径> --base <分支> [--confirm]`（开 PR）
- `scripts/sop_pr_checks.sh <仓库路径>`（只读·轮询 CI）
- **工作流五 · 多工作树并行开发**（`--no-ff` 普通合并特化）：无专属脚本，按 `SKILL.md` 的 worktree 流程 +  `## 第17章 工作流五 多工作树并行开发（–no-ff 普通合并特化）` 约束落地；提交前文档门禁复用 `sop_docs_sync_check.sh`，分支清理复用工作流八。
- **工作流六 · CI 失败排错**
- `scripts/sop_ci_failed_log.sh <仓库路径>`（只读·下载失败日志）
- `scripts/sop_pr_checks.sh <仓库路径>`（只读·轮询状态）
- `scripts/sop_ci_rerun.sh <仓库路径> [--confirm]`（重跑失败 job）
- **工作流七 · Release 发版**（按 `SKILL.md` 流程；公开动作需暂停确认，详见 `## 第19章 工作流七 Release 发版` + 第四篇模块「第12章」Fork CI 实证要点）。
- **工作流八 · 分支清理回收**
- `scripts/sop_branch_merged_status.sh <仓库路径>`（只读·合并状态 + open PR 反向识别）
- `scripts/sop_fetch_prune.sh <仓库路径> [--confirm]`（清理本地过时远程跟踪引用）
- **工作流九 · PR 全生命周期操作**（开新PR/重复核查/上游规范遵循/响应评审/合并/关闭/其他 PR 操作）：开 PR / 回复 PR 用 `scripts/sop_pr_create.sh <仓库路径> --base <分支> [--confirm]`（引用 工作流四  `### 16.3 阶段 2 提交 / 推送 / 触发 CI`）；CI 轮询 `scripts/sop_pr_checks.sh <仓库路径>`；其余 PR 交互（view/diff/comment/edit/close/review）按 第四篇模块「第9章」9.3 `gh pr` 命令；评审回应与截图上传的完整编排见 工作流九本体。
- **工作流十 · 清理工区维护**（本地文件清理）：按"先搜列、后确认、再删除"强门禁落地；Git 分支删除走工作流八（ `## 第20章 工作流八 分支清理回收`），不在此流程内。
- **公共解析 / 工具**：`scripts/sop_resolve_repo.sh <仓库路径>`（一次性提取 GH_USER/REPO_NAME/UPSTREAM 三元组）；`scripts/lib/sop-common.sh`（被各脚本 source，集中工具探测与远端三元组解析）。
- **参考资料（references/）**：
- `references/docs-sync-checklist.md`：提交前文档同步「分层检查清单」权威定义（Tier 1/2/3 + 改动类型映射），对应第四篇模块「第11章」。
- `references/fork-ci-pitfalls.md`：Fork CI 实证要点与编译构建规则（标签重推、发布 job 守卫、clippy/rustfmt 坑、443 两类情形与 REST 绕过），对应第四篇模块「第12章」。
- `references/gh-capability.md`：`gh` CLI 能力全览与能力边界（哪些 `gh` 不能做、归 `git`/CI），对应第四篇模块「第9章」。

> 本索引与技能 `SKILL.md` 的「核心工作流」章节一一对应；记忆侧负责"约束与为什么"（ `## 第1章 全局禁令（最高优先级）` + 第五篇各章），技能侧负责"具体跑哪个脚本、怎么跑"，两者组合即可端到端落地任意 GitHub 操作。

---

## 第14章 工作流二 信息读取与搜索

> 核心规则：凡涉及 GitHub（https://*[github.com/](http://github.com/)*）的读取/搜索/操作，一律优先使用 `gh`；仅当 `gh` 不可用或确实搜不到/无对应能力时，才回退网页工具。
>
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）。**

### 14.1 适用范围

1. 用户给出 GitHub 网址（仓库/文件/PR/Issue/Release/Action 等）要求阅读、分析、核查。
2. LLM 工作流自身需要读取/分析 GitHub 上的信息、数据、代码、文档（调研、自审参考、查证 API）。
3. 任何"搜索 GitHub 仓库/代码/Issue/PR"的需求（无论用户要求还是流程需要）。
4. `gh` 能力总览覆盖的任务/事项/操作（见 `## 第9章 gh 能力速查`）。

### 14.2 优先顺序（硬规则）

1. **首选 `gh`**：`D:\Tools\Assembly\gh.exe`。
2. **回退条件（仅限其一）**：

- (a) `gh` 不可用（缺失/未登录/网络不可达）；
- (b) `gh` 确实搜不到或无对应能力（代码搜索仅索引默认分支、需渲染网页导航/图片/样式）。

满足才改用 WebFetch/WebSearch；一般网页搜索走 `firecrawl-mcp`（经 dynamic-mcp 聚合器）兜底。

1. **禁止**：无理由跳过 `gh` 直接用网页搜索；能用 `gh` 完成却改用 MCP/Web UI（除非 403 等明确失败）。

### 14.3 决策流

```
GitHub 读取/搜索/操作请求 → 是否 gh 能力覆盖？
   ├─ 是 → 用 gh → gh 可用且取到 → 完成
   │            └─ gh 不可用/搜不到/无对应能力 → 回退 WebFetch/WebSearch(firecrawl-mcp)
   └─ 否（本地 VCS 动作）→ 用 git
```

### 14.4 跨命令通用约束

- 代码搜索（`gh search code`）仅索引默认分支；搜索 qualifier 语法需正确（自由文本与 `--language` 等分列，勿混写进同一引号）。
- 全站搜索速率约 30 次/分钟（已登录）；`gh search` 要求 token 含 `repo` scope（已满足）。
- `gh` 返回为原始文本非网页渲染（`gh api contents` 返 base64，需解码）。

---

## 第15章 工作流三 日常同步巡检

> 每日一次。原则：先校验配置，再分别检查「本地 ↔ 你的远端仓库(origin)」与「你的远端仓库(origin) ↔ 上游仓库(upstream)」；仅快进/无冲突类操作自动执行，一切冲突与公开动作一律大白话说明 + 后果 + 暂停等指令（强门禁，绝不跳过）。
>
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）。**

### 15.1 阶段 0 — 配置校验（前置门槛）

- `git remote -v` 须同时存在 origin + upstream；`git rev-parse --abbrev-ref main@{upstream}` 须为 origin/main。
- 缺项 → 报告具体缺什么、暂停，请你提供信息后助手自动补齐（如 `git remote add upstream <url>`、`git branch --set-upstream-to=origin/main main`）。
- **多 remote 直观命名**：除 `origin`（你的 fork）+ `upstream`（原作者仓库）外，若同时关联公司 GitLab 等，可起直观名避免混淆：`git remote add company https://gitlab.company.com/项目.git`、`git remote add github https://github.com/你的账号/项目.git`。`origin` 只是习惯命名，非规定；合理多 remote 能让多仓库切换更清晰（见第8.2 账户信息 Fork 仓库清单）。

### 15.2 第一步 — 本地 ↔ 你的远端仓库(origin)

- 工作区脏（有未提交(commit)改动）→ 硬停止整个巡检，大白话说明，等指令；你提交(commit)后手动重启。
- 停在 功能分支(feat) 且干净、有未推送(push)提交(commit) → 照常同步 main，绝不碰 feat；提醒"feat/xxx 有 N 个提交(commit) 没推到你的远端仓库(origin)"，是否推送(push) 由你定，默认不推。
- `git rev-list --left-right --count main...origin/main`（落后/领先）：
- 仅落后 → `git pull --ff-only origin main`（自动）；
- 仅领先 → `git push origin main`（自动）；
- 双向分叉 → 暂停+智能建议（A 以你的远端仓库(origin) 为准 `git reset --hard origin/main` / B 以本地为准：经功能分支(feat) 走 PR 合并(merge) 后再同步（**禁止强推 main，见 `## 第1章 全局禁令（最高优先级）` **）/ C 合并(merge) 保留双方 / D 变基(rebase) / E 中止不动；疑似验证残留建议 A，仍暂停等确认）。

### 15.3 第二步 — 你的远端仓库(origin/fork) ↔ 上游仓库(upstream)

- `git rev-list --left-right --count origin/main...upstream/main` =（M = 你的远端仓库(origin) 领先, K = 上游仓库(upstream) 领先）。
- M=0, K=0 → 已同步；
- M=0, K>0 → 自动 `git merge upstream/main` + `git push origin main`（fork 跟随 上游仓库(upstream)）。
- M>0 → 查 PR（**用作者口径，弃用窄口径**）：`gh pr list --repo <upstream> --author zhangweildlh --state all`。
- ⚠️ 口径区别：`--head zhangweildlh:main` 按"PR 的源分支"精确匹配，只返回源分支恰好叫 `main` 的 PR，会漏掉用 `feat/*`/`fix/*` 分支开的 PR；`--author zhangweildlh` 按"PR 作者"匹配，返回我开的所有 PR，不会漏判。仅在专门查"main→main 这条通道"时才叠加 `--head zhangweildlh:main`。
- **有未合并也未拒绝的开放 PR（state=open）→ 记为「PR 待审」态**：大白话报告 PR 编号、base、状态，说明这是贡献回 上游仓库(upstream) 的正常通道；不重复开 PR、不覆盖、不暂停，继续巡检/结束；若同时 K>0（上游仓库(upstream) 已前进），额外提示「PR 可能落后于 上游仓库(upstream)」，建议 rebase 功能分支(feat) 后更新 PR，并暂停等你指令。
- rejected（closed 且 merged=false）→ 问题四；
- 无 PR → 问题三（向 上游仓库(upstream) 开 PR，已开不重复，暂停等指令）；
- M>0, K>0 → 问题五/六（`git merge-tree --write-tree origin/main upstream/main` 干净→全自动合并(merge)+推送(push)；冲突→暂停列 A/B/C/D）。

### 15.4 冲突处理（六类问题）

| 编号 | 场景 | 处理方式 |
| ------ | ------ | ------ |
| 问题一 | 本地 main ↔ 你的远端仓库(origin) 双向分叉 | A–E 方案，暂停等确认（见 `### 15.2 第一步 — 本地 ↔ 你的远端仓库(origin)` 双向分叉） |
| 问题二 | 停在 功能分支(feat) 有改动 | 未提交(commit)→硬停止等指令；已提交(commit)未推送(push)→同步 main、不碰 feat、提醒、默认不推 |
| 问题三 | fork 领先 上游仓库(upstream) 且停滞 | 不覆盖；无 PR 则向 上游仓库(upstream) 开 PR（gh pr create --repo  --head zhangweildlh:<实际源分支，如 feat/v1.7.0-xxx> --base main，暂停等指令），已开不重复。注：–head 这里是创建 PR 时必填的源分支参数（按当前工作分支填），与"查 PR 的查询口径"不是一回事，查询一律用 --author 口径 |
| 问题四 | fork 领先且 PR 被拒 | 有反馈→git fetch upstream 重看状态、在 功能分支(feat) 改、必要时 git rebase upstream/main、开新 PR（暂停等指令）；无反馈→保持 fork 领先、不重提 |
| 问题五 | 双方改、无文件冲突 | 全自动合并(merge)+推送(push) |
| 问题六 | 双方改、同文件冲突 | 暂停列 A 以 上游仓库(upstream) 为准 git checkout --theirs  / B 以你的远端仓库(origin) 为准 git checkout --ours  / C 手动合并 / D 中止 git merge --abort，绝不自动选 |

### 15.5 特殊场景（仓库残缺/本地无 .git / 本地独有文件）

- **本地仓库无 `.git`**（如 SyncFolders 同步丢失 `.git`，仅剩一份上游快照 + 本地独有文件）：

用 `git init -b main` + `git remote add upstream <url>` + `git remote add origin <url>` + `git fetch upstream`（公开库读取免认证）→ `git reset --mixed upstream/main` 保留工作树 → 列差异 → 覆盖前先备份本地当前版本到临时目录 → `git checkout -- .` 刷跟踪文件到 upstream/main（不动未跟踪本地文件）；

`git reset --hard`/`git clean` 均禁用以防误删 `.workbuddy`。

远端 fork 推送前先 `gh auth setup-git` 桥接令牌（本机 [github.com](http://github.com) 已走 `gh auth setup-git` 桥接；若某环境 `git push` 因无凭据失败，先 `gh auth setup-git`）。

- **本地独有文件（如 `.workbuddy`）不进同步**：用 `.git/info/exclude`（本地专属、不提交不推送、位于 `.git` 内、`reset`/`checkout`/`pull upstream` 均不影响）写入忽略行，保持 fork 为上游干净镜像且无 `.gitignore` 分歧。若文件已被跟踪/推送过，需先 `git rm --cached -r <路径>`（保留磁盘、下次 push 删远端）再忽略。`.workbuddy` 是 WorkBuddy 项目记忆，**绝不删除**；忽略=不跟踪，不影响磁盘。

### 15.6 强门禁总述

仅「快进拉取(pull)、快进推送(push)、跟随/无冲突合并(merge)、M>0+开放 PR（K=0）报告继续」可自动执行；其余冲突或公开动作（双向分叉、工作区脏、feat 未提交、问题三开 PR、问题四、问题六）一律大白话 + 后果 + 暂停等指令。

---

## 第16章 工作流四 标准代码修改

> 原则：尽量由助手用 `git`+`gh` 自动执行；仅「fork Actions 一次性手动启用」「upstream 维护者合并」需人类介入。
> 改代码 / 提 PR 前，先过 **完整裁决器与全局契约面（从整个仓库代码整体性、全局性出发）**（画契约面 → 定方案 → 联动验证 → 文档代码同改），避免叠补丁 / 覆盖不全 / 过度覆盖违反契约。
>
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）。**
>
> 多任务并行开发（各任务独立工作树(worktree)、最终 `--no-ff` 普通合并回主线(main)）属本流程的并行特化变体，其专用 SOP 见 `## 第16章 工作流四 标准代码修改` 。

### 16.1 阶段 0 启动前闸门

1. **完整性**：预定文件全部编写/修改完毕，无残留 WIP、TODO 占位、空实现、调试残留。
2. **正确性**：逐文件 Read + `git diff` 复核，无语法/类型/逻辑 BUG 与瑕疵。
3. **静态校验**：有工具链则跑 lint/test（Rust：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-features`）；有意不装工具链时，以「开 PR 触发 CI + 严谨 diff 自审」替代入口，不得跳过自审。
4. 闸门未过 → 先修复，不进入阶段 1。

### 16.2 阶段 1 同步与建分支

- 一次性前置（已配置跳过）：`git remote add upstream <url>`；`git branch --set-upstream-to=origin/main main`
- `git switch main && git pull upstream main && git push origin main`
- `git switch -c feat/<topic>`（先建分支，再提交）
- ⚠️ **提交前 born 状态检查（防根提交异常）**：建分支后、首次 `git commit` 前，务必 `git rev-parse HEAD` 确认当前分支已 **born（解析出有效 SHA、有父提交）**。若报 `unknown revision` / HEAD 无效（unborn 状态），**绝不能**直接 `git add -A && git commit`——这会把整棵树当作"全新"生成无父**根提交**，且分支引用可能不被推进，造成游离对象与"无关历史合并"风险。✅ 正确修复：`git reset --mixed main`（保留工作树、让当前分支真正继承 main 为父）→ `git add -A` → 提交；复验 `git diff main --stat` 应为增量（如 `62 files changed, ...`），而非"N 文件全新增"假象。⚠️ **分支名含斜杠（如 `feat/2026-07-31-xxx`）在某些环境更易触发引用歧义致 unborn**，建分支后必跑 `git rev-parse HEAD` 核验（已实战验证于某技能 CLI 仓库：首次 `feat/2026-07-31-skill-updates` 提交即触发根提交，经 `git reset --mixed main` 修复）。

### 16.3 阶段 2 提交 / 推送 / 触发 CI

> **前置约束（文档同步门禁依赖）**：本阶段下方的「文档—代码同步硬门禁」由 `github-personal-manager` 技能落地——**须先按 `## 第13章 工作流一 github-personal-manager 自动激活（GitHub 工作流总闸门，前置）` 激活该技能，在其技能目录下执行 `bash scripts/sop_docs_sync_check.sh`**（脚本与 `references/docs-sync-checklist.md` 由技能提供，不在本记忆内复制）。未激活技能时不得跳过该门禁，应改为「基于 `git diff`/`git status` 真实变化，人工核对 README/CHANGELOG/docs 是否同步」的等价自审。

- `git add <文件>` → `git commit -m "清晰描述，一 PR 一主题"`
- `git push -u origin feat/<topic>`
- ⚠️ **提交(commit)前硬门禁：文档—代码同步（分层检查清单）**（详见 `## 第11章 提交前文档同步门禁`）：先 `bash scripts/sop_docs_sync_check.sh <仓库路径>` 按 `references/docs-sync-checklist.md` 查仓库是否存在清单文件并分析同步状态；Tier 1（README/README_EN/CHANGELOG）未同步 → 必须基于 `git diff`/`git status` 真实变化更新相应章节并一并 `git add` 后再提交(commit)，严禁 Tier 1 未同步时直接提交(commit)代码；Tier 2（docs/·契约·i18n·examples 等）未同步须处理或说明；Tier 3（测试/锁文件）仅提示。
- **开 PR（用 `gh`，免 403）**：
- **向 上游仓库(upstream) 贡献**：`gh pr create --repo <upstream> --head zhangweildlh:feat/<topic> --base main`
- **在 fork 内部开 PR 触发 fork CI（base=fork main）**：`gh pr create --repo zhangweildlh/<fork> --head zhangweildlh:feat/<topic> --base main`
- ⚠️ **多 remote 口径坑**：本地同时存在 origin+upstream（甚至 upstream-pr）时，`gh pr create` 默认取 upstream 报 “No commits between main and feat/…”。凡开 PR 一律显式带 `--repo`（fork 内部 PR 用 `zhangweildlh/<fork>`，上游贡献 PR 用 `<upstream>`），且 `feat` 分支已推到 `zhangweildlh/<fork>`。
- ⚠️ **PR 正文用 `--body-file`**：here-doc 含中文括号（全/半角）会被 bash 解析失败；一律先写正文到文件再用 `gh pr create --body-file <file>`。
- 轮询 `gh pr checks` / `gh run list`，必须全部 green
- 注：**部分 fork 的 `ci.yml` 仅响应 `push:[main]` 或 `pull_request:[main]`**（取决于该仓库的 workflow 配置）；推特性分支若不触发 CI，须靠开 PR（fork 内部 PR 触发 fork CI，或上游贡献 PR 触发上游 CI）触发。各 fork 的 CI 触发条件以该仓库 `.github/workflows/` 实际配置为准。
- ⚠️ **提交整理（amend / rebase -i，仅限未推送或已授权自有 feat 分支）**：
- `git commit --amend --no-edit`：补漏提交的文件进最近一次提交（不改动提交信息）；`git commit --amend -m "新信息"`：改最近一次提交信息。未推送时直接 amend 即可；**已推送则需 `--force-with-lease` 强推 feat 分支，绝不强推 main**。
- `git rebase -i HEAD~N`：开 PR 前整理最近 N 个本地提交——把 typo / 调试 log 等合并（改为 `squash` / `fixup`），让 PR 历史干净、易 review。常用动词：`pick`（保留）/ `reword`（改信息）/ `squash`（合并保留信息）/ `fixup`（合并丢弃信息）/ `drop`（删除）。
- **硬约束**：`rebase -i` / `amend` **仅限未推送的本地提交，或仅自己使用且已获授权的 feat 分支**；**禁止**用于 `main`、已推送且他人/PR 依赖的分支（改写历史违反审计链）；改写后强推仅允许 `feat` 分支且用 `--force-with-lease`。

### 16.4 阶段 3 对齐上游并强推（功能分支(feat)，非 main）

- `git fetch upstream && git rebase upstream/main feat/<topic>`
- 冲突：助手就地解决（仅语义真不确定才问用户）→ `git rebase --continue` → `git push --force-with-lease origin feat/<topic>`（**仅强推 feat 分支，绝不强推 main**）
- 重跑 CI 至绿
- ⚠️ **强推一律 `--force-with-lease`，禁用裸 `--force`**：`--force-with-lease` 推送前会检查远程是否有本地不知晓的更新（他人新提交），有则拒绝推送、避免覆盖他人工作；裸 `--force` 无条件覆盖，风险高。仅强推 feat 分支，绝不强推 main（见第1.1 禁强推 main）。

### 16.5 阶段 4 合并

- 贡献 upstream：由 upstream 维护者合并，助手仅监控，不得自行合并（硬约束）。
- 自有仓库/自测 PR：助手用 `gh pr merge` 合并。
- fork 内部 PR（仅用于触发 fork CI 验证）：`gh pr merge --squash`（合并(merge) 即更新 fork main，无需强推 main）。

### 16.6 阶段 5 收尾同步与清理

- `git switch main && git pull upstream main && git push origin main`
- `git branch -d feat/<topic>`（本地）+ `git push origin --delete feat/<topic>`（fork 远程分支）

### 16.7 硬约束

- 本地 main 跟踪 origin/main，不跟踪 upstream/main。
- `git push` 只推 origin，绝不推 upstream。
- fork Actions 需一次性手动启用（GitHub 限制，无法 API 化）；启用后 PR 才跑校验。
- 给上游建 PR 用 `gh`（用户令牌免 403），Web UI 仅兜底。

### 16.8 实用工具：stash 临时抽屉（被打断时保存进度）

> 安全、非破坏性：stash 仅暂存工作区改动，不丢弃、不重写历史，可随时恢复。

- **场景**：在 `feat` 分支开发到一半（改动未成提交），突然需切去修 hotfix / 同步 main / 响应紧急任务。
- **保存**：`git stash push -m "feat A 做到一半"`（也可简写 `git stash`，但带 `-m` 便于辨识）。
- **切回恢复**：`git checkout <原分支>`（或 `git switch <原分支>`）→ `git stash pop`（恢复最近一个 stash 并从列表删除）。
- **常用操作**：
- `git stash list`：查看 stash 列表；
- `git stash apply`：恢复但不删除（可多次应用）；
- `git stash drop`：删除最近一个 stash；
- `git stash clear`：清空所有 stash。
- **注意**：
- `pop` / `apply` 冲突时须手动解冲突；
- 勿在 `stash` 后执行 `git reset --hard`（会丢工作树，stash 仍可 `pop` 挽回，但流程易乱）；
- 巡检（见日常同步巡检工作流）遇工作区脏会硬停止——`stash` 是先"暂存半截"再继续的安全替代，但 stash 后仍需在合适时机 `pop` 回来继续。

---

## 第17章 工作流五 多工作树并行开发（–no-ff 普通合并特化）

> 适用：同一 Git 仓库需**多任务并行**开发（每个任务独立工作树(worktree)、代码隔离），最终**普通合并(–no-ff)**回主线(main)、补充变更文档(CHANGELOG)、按需清理工作树(worktree)与分支(branch)。本质是「标准代码修改（ `## 第16章 工作流四 标准代码修改`）」的**并行多工作树特化变体**：用 `git worktree` 突破单目录单工作树限制，用 `--no-ff` 强制双父合并碑(merge commit)以保留中间提交谱系、可整段回滚、不改写历史；回滚一律 `git revert`（禁用 `reset --hard`+强推，见 `## 第1章 全局禁令（最高优先级）`）。
> 与既有规则关系：提交(commit)前文档—代码同步遵循「第11章 提交前文档同步门禁」；分支(branch)清理的门禁与命令见 `### 17.11 阶段六：清理分支(branch)（本地 + 远端，按要求 / 条件）`（多工作树场景专用步骤）；改动前先过 **完整裁决器与全局契约面（避免叠补丁 / 覆盖不全 / 过度覆盖违反契约）**。
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）：先用 `git rev-parse --show-toplevel` 等确认「要操作的仓库目录」到底是主仓库还是某个工作树(worktree)，路径异常（如指向非预期目录、根目录意外出现 `.git`）立即暂停、先问用户，对齐后再做。未核验路径不得进入任何后续步骤。**

### 17.1 适用范围

- ✅ 同一 Git 仓库，多任务并行，彼此代码隔离、互不干扰。
- ✅ 每个任务在**独立工作树(worktree)**编码，最终**普通合并(–no-ff)**回主线(main)。
- ✅ 合并后补充 `CHANGELOG.md` 等变更文档，并按条件**删除无用工作树(worktree) + 清理分支(branch)（本地 + 远端）**。
- ❌ 不适用：单任务线性开发、需改写历史的变基(rebase)/压平(squash)合并、跨仓库协作（本工作流仅覆盖自有仓库(fork)，不含上游(upstream)同步协同）。

### 17.2 方法论（心智模型 · 为什么这样做）

理解「为什么」才能在任何异常下不偏离原则。

- **工作树(worktree) = 物理隔离沙箱**：每个 worktree 是仓库在不同目录的完整检出，拥有独立工作区与依赖产物（如 `node_modules`/`venv`/`target`）。多任务并行时，任务 A 的未提交改动 / 依赖版本不会污染任务 B。代价：每个 worktree 需独立安装依赖；磁盘占用叠加。
- **分支(branch) = 廉价指针**：分支只是指向某个提交(commit)的指针，删除分支**不删除提交**（只要提交仍被其他引用可达，如合并碑的第二父）。推论：清理分支零风险——只要该分支已通过 `--no-ff` 合并，其提交仍挂在主线(main)的合并碑下，删除指针不会丢代码。
- **合并碑(merge commit) = 回滚书签**：`--no-ff` 强制生成**双父合并提交**：父1 = 主线(main)侧、父2 = 功能分支(feat)尖端。这条合并碑就是「整段回滚」的**唯一锚点**：`git revert -m 1 <合并碑>` 一次性撤销该功能引入的全部改动。若用快进(fast-forward)或压平(squash)，则无独立合并碑，失去整段回滚能力——故**一律 `--no-ff`**。
- **历史不可变 = 审计链**：已推送的提交(commit)属团队 / 公开历史，**禁止改写**（`rebase -i` / `amend` / `--force` 推送）。`--no-ff` 是「追加」而非「改写」：只新增一个合并碑，原有提交(commit)哈希全部不变。推论：合并碑存在本身即证明「未改写历史」。

**四大约束的来源**：

| 用户约束 | 对应机制 | 违反后果 |
| ------ | ------ | ------ |
| 能够整段回滚 | 双父合并碑 + git revert -m 1 | 无合并碑则只能逐提交(commit)回退，易漏 |
| 中间提交(commit)全保留 | –no-ff 保留功能分支(feat)谱系 | squash / rebase 会丢失提交(commit)粒度 |
| 有合并碑 | –no-ff 强制生成 | fast-forward 不产生碑 |
| 不改历史 | 仅追加、不改写已推送提交(commit) | rebase / amend / --force 破坏审计链 |

### 17.3 四大约束 ↔ 唯一验证矩阵

合并后**必须**逐项验证，全部满足才算合格。任一项不满足即视为合并失败，需排查。

| 约束 | 验证命令 | 预期输出 / 判定 | 失败含义 |
| ------ | ------ | ------ | ------ |
| ① 整段可回滚 | git cat-file -p <MERGE_HASH> | grep -c parent | 输出 2（双父） |
| ② 中间提交(commit)全保留 | git log --oneline <MERGE_HASH>^2 | 列出功能分支(feat)全部中间提交(commit) | 提交(commit)被压平 / 丢失 |
| ② 中间提交(commit)可达 | git merge-base --is-ancestor  HEAD; echo $? | 输出 0 | 功能尖端不在主线(main)历史中 |
| ③ 有合并碑 | git log --oneline --merges -1 | 显示该合并碑 | 未生成合并碑 |
| ④ 不改历史 | git log --format=%H <BASE_BRANCH>~N…<BASE_BRANCH>（合并前后对比） | 合并碑之前的主线(main)提交(commit)哈希与合并前一致 | 历史被改写 |

> 注：`<MERGE_HASH>^2` 表示合并碑的第二父（功能分支(feat)侧）；`<TIP>` 为功能分支(feat)尖端提交(commit)哈希；`<BASE_BRANCH>` 为受保护主线（默认 `main`）。

### 17.4 核心原则（不可动摇）

1. **普通合并**：功能分支(feat)合入主线(main)一律 `git merge --no-ff`，生成双父合并碑，保留中间提交(commit)谱系，不改写历史。
2. **整段可回滚**：合并碑必须是双父结构，回滚命令唯一为 `git revert -m 1 <合并碑>`。
3. **版本号单一事实源（若随合并发版）**：版本标识（如应用清单 / 包描述中的 `version`）须保持一致；未发版时推荐分支(feat)保持与主线(main)同版本号，合并后统一升。
4. **硬禁令（见 `## 第1章 全局禁令（最高优先级）`）**：禁止对 `<REMOTE>/<BASE_BRANCH>` 执行强推（`--force` / `-f` / `--force-with-lease`）或删除。
5. **最高优先级约定（项目自定）**：项目可声明「最高优先级约定」（如：某核心模块 / 功能在合并冲突时**不得被覆盖或丢弃**）。合并冲突涉及该区域时，**立即暂停并告知用户**，大白话说明，不擅自解冲突。
6. **公开动作须授权**：删除远端分支(branch)、打标签(tag)、创建 Release 属公开动作，**须用户明确授权**后执行。

### 17.5 参数占位与前置条件

**参数占位表（执行前填写）**：

| 占位 | 含义 | 填写方式 |
| ------ | ------ | ------ |
| <MAIN_REPO_PATH> | 主仓库（含 .git 的工作树）绝对路径 | 主仓库根目录 |
| <WORKTREE_ROOT> | 工作树父目录（与 <MAIN_REPO_PATH> 分离的独立目录） | 独立父目录，避免被主仓库清理连坐 |
|  | 远端名 | 通常 origin |
| <BASE_BRANCH> | 受保护主线分支 | 通常 main |
|  | 功能 / 修复分支名 | feat/ / fix/ |
|  | 功能分支(feat)尖端提交(commit)哈希 | 合并前由 git rev-parse  取得 |
| <MERGE_HASH> | 合并碑哈希 | 合并后由 git rev-parse HEAD 取得 |
| / | 仓库归属与名（仅 gh 命令需要） | 远端仓库标识 |
| <INSTALL_DEPS> / <RUN_TESTS> / | 依项目包管理器与脚本替换 | 如 npm ci / npm test / npm run build |

**前置要求（执行前必须确认）**：

- 先按「第10章 路径核验」确认 `<MAIN_REPO_PATH>` 真实存在且为 Git 仓库、确为预期目录；路径异常立即暂停、先问用户。
- Git 身份与远端已配置（`git remote -v` 可见 `<REMOTE>`）。
- `<BASE_BRANCH>` 受保护（合并走 PR，不直推）；或确认为无保护、允许直推（由分支保护核验决定，见 `### 17.8 阶段三：《--no-ff》 合并到主线(main)`）。
- 已约定分支(branch)命名规范与变更文档(CHANGELOG)格式（推荐 Keep a Changelog）。
- 项目已具备可运行的测试与构建流程（CI 或本地等效）。
- `gh` 已登录（仅当涉及 PR / 分支保护核验 / 远端分支删除授权时）。

### 17.6 阶段一：从主线开出独立工作树（多任务并行）

**前置要求（唯一判定）**：

- `git fetch <REMOTE>` 已完成，远端最新。
- 当前在主线(main)：`git checkout <BASE_BRANCH>`。
- 主仓库工作树干净：`git status --porcelain` 输出**必须为空**（否则先处理未提交改动）。

**操作命令（唯一写法）**：

```
git worktree add <ABS_PATH> -b <BRANCH> <BASE_BRANCH>
```

- `<ABS_PATH>`：绝对路径，建议 `<WORKTREE_ROOT>/<topic>`（独立父目录，与主仓库分离）。
- `<BRANCH>`：命名遵循约定（如 `feat/<topic>` / `fix/<topic>`）。
- **多任务并行**：对每个任务重复本步，各自独立 `<ABS_PATH>` + `<BRANCH>`，互不干扰。
- 约束：一分支(branch)一工作树(worktree)；不同工作树(worktree)必须 checkout 不同分支(branch)；各工作树(worktree)基于最新主线(main) HEAD。

**验证（无歧义）**：

- `git worktree list` 列出新条目，路径与分支(branch)正确。
- 新目录存在且含完整仓库文件。

**注意**：

- 每个 worktree 需独立安装依赖：在 `<ABS_PATH>` 内执行 `<INSTALL_DEPS>`（依赖产物不跨工作树(worktree)共享）。
- **合并只依赖提交(commit)引用**：只要 `<REMOTE>/<BRANCH>` 引用完好，即便本地 worktree 因外部清理而失效，合并不受影响。重要本地产物应纳入版本控制或另行备份。

### 17.7 阶段二：工作树内开发 + 测试

**开发**：在各自 worktree 目录内实现功能，**按需多次提交(commit)**，保留中间提交(commit)（这是 `--no-ff` 保留谱系价值的来源；不要等全部完成才一次性提交(commit)）。

**测试链（唯一顺序，全绿才允许合并）**：

```
cd <WORKTREE_PATH>
<INSTALL_DEPS>
<RUN_TESTS>
<BUILD>
```

- **全绿判定（唯一）**：测试套件零失败；构建退出码 0 且产物目录生成。
- 测试与构建命令依项目替换，等价目标为「验证功能正确且可发布构建」。

**守约定**：项目最高优先级约定区域功能完全保留（见 `### 17.4 核心原则（不可动摇）` 第5点）。

**版本号（关键防坑）**：

- **若本任务将随合并一起发版**：分支(feat)内同步升版本标识（曾发生漏升某处版本字段，合并时需补）。
- **暂不发版**：保持与 `<BASE_BRANCH>` 同版本号，留待合并后统一升（推荐，避免多分支(branch)版本号分叉）。

**推送功能分支（建议，非强制但推荐）**：

```
cd <WORKTREE_PATH>
git push -u <REMOTE> <BRANCH>
```

- 目的：使 `<REMOTE>/<BRANCH>` 引用持久化，规避本地 worktree 失效导致引用丢失。非强推，合规。

**定期同步主线（减少后期冲突）**：

```
git fetch <REMOTE>
git rebase <REMOTE>/<BASE_BRANCH>     # 在当前工作树(worktree)分支(feat)上执行
```

- 仅在功能分支(feat)未推送或推送后允许 rebase 自身分支(branch)时使用；已推送且他人依赖的分支(branch)勿改写。

### 17.8 阶段三：《--no-ff》 合并到主线(main)

**选择执行地（唯一）**：合并**必须在主仓库目录**执行，**绝不在 worktree 内**（worktree 可能失效且其 HEAD 非主线(main)）。`cd <MAIN_REPO_PATH>`。

**预检（唯一顺序，缺一不可）**：

1. `git fetch <REMOTE>` —— 确保远端最新。
2. `git checkout <BASE_BRANCH>` + `git status --porcelain` 为空 —— 主仓库干净。
3. `git merge-tree --write-tree <BASE_BRANCH> <REMOTE>/<BRANCH>` —— 预测冲突；输出为**干净树哈希**（无 `CONFLICT` 行）= 零冲突预测。
4. 分支保护核验（若使用 `gh`）：`gh api repos/<OWNER>/<REPO>/branches/<BASE_BRANCH>/protection`

- 返回 `404`（无分支保护）→ 走**本地 merge + 正常 push**（本工作流路径，合规）。
- 返回保护规则 → 须走 PR 流程合并，**不在此工作流直接 push**。
- ⚠️ 多 remote 下 `gh` 可能默认解析错误远端，必须显式 `--repo <OWNER>/<REPO>`。

**执行合并（唯一命令）**：

```
git merge --no-ff <REMOTE>/<BRANCH> \
  -m "merge: <主题>（<BRANCH>）" \
  -m "来自分支 <REMOTE>/<BRANCH>，尖端 <TIP>" \
  -m "整段回滚：git revert -m 1 <合并碑>"
```

- 使用多条 `-m` 拼接碑正文，避免依赖外部消息文件（某些环境下消息文件路径不可写会导致 `could not read file` 失败）。
- 合并完成后用 `git rev-parse HEAD` 取得 `<MERGE_HASH>`，回填第三行 `-m` 中的占位（或合并后在变更文档中固化回滚命令）。

**冲突处理（唯一策略 + 决策树）**：若 `merge-tree` 预测有冲突，或合并时停在冲突态：

1. `git status` 查看冲突文件清单。
2. **手动 Edit 解决**，**禁止** `git checkout --ours/--theirs` 全量覆盖（会丢失对方依赖 / 功能）。
3. **按冲突类型决策**：

- **版本号 / 元数据冲突**（版本字段、锁文件、变更文档、说明文档）：统一为目标基线版本（取 `<BASE_BRANCH>` 主线(main)版本，因未发版且功能作同周期并入），**保留**功能分支(feat)新增依赖 / 条目。
- **锁文件双冲突块**（如依赖清单的根 `version` 与包列表两处）：两处均解决为目标版本，保留完整依赖树，JSON 必须有效（用对应解析器校验）。
- **最高优先级约定区域冲突**（项目声明的核心模块）：**立即暂停，告知用户**，大白话说明，不擅自解（见 `### 17.4 核心原则（不可动摇）` 第5点）。

1. `git add <file>` 逐个标记已解决。
2. `git commit`（合并继续；可 `--no-edit` 或补正文）。

**合并碑结构验证（必须全满足，对照  `### 17.3 四大约束 ↔ 唯一验证矩阵`）**：

- `git cat-file -p HEAD | grep -c parent` 输出 `2`（双父）。
- `git merge-base --is-ancestor <TIP> HEAD; echo $?` 输出 `0`（功能尖端可达）。
- `git log --oneline HEAD^2` 列出功能分支(feat)全部中间提交(commit)（谱系保留）。

**合并后补充提交（唯一要求）**：必须补充变更文档(CHANGELOG)与统一版本号，**此提交(commit)不改功能代码，仅文档 / 版本**。

1. **变更文档([CHANGELOG.md](http://CHANGELOG.md))**（Keep-a-Changelog 结构，`## [版本] - 日期` / `### Added` / `### Changed` / `### Fixed` / `### Notes`）：版本条目补「来源分支、基于 `<BASE_BRANCH>` @ `<hash>`」；补合并说明：`--no-ff` 合入 `<BASE_BRANCH>`，合并碑 `<hash>`，整段回滚 `git revert -m 1 <hash>`；若合并后有补充提交(commit)也改了变更文档，在 Notes 固化「干净回滚须两步：先 `git revert <补充提交>` 再 `git revert -m 1 <合并碑>`」；补最高优先级约定遵守声明。
2. **版本号一致性（若发版）**：各版本字段（包描述、应用清单、源码兜底字符串、说明文档引用等）须一致，均由单一事实源注入，兜底值同步。
3. 提交(commit)：`git commit -m "docs: 补充 CHANGELOG 与版本一致性（<version>）"`。

> 注：提交(commit)前文档—代码同步仍须过「第11章 提交前文档同步门禁」（Tier 1 未同步必须先补文档）；本节为合并后补充提交(commit)的专用要求。

**推送（唯一合规写法）**：

```
git push <REMOTE> <BASE_BRANCH>
```

- 无 `-f` / `--force` / `--force-with-lease`，合规，不触发硬禁令（见 `## 第1章 全局禁令（最高优先级）`）。触发仓库 CI（若有），须全绿。

**合并后验证（无歧义）**：

- CI 均 `success`（查法：`gh run list --repo <OWNER>/<REPO> --branch <BASE_BRANCH> -L 5`，最新若干条均绿）。
- 若功能分支(feat)曾开 PR：GitHub 自动识别合并碑为 merge commit，PR 标 `MERGED`。
- `git log --oneline --merges -1` 确认合并碑存在、功能提交(commit)保留。

### 17.9 阶段四：整段回滚能力验证（建议，非强制但推荐）

目的：在合并后立即证明「整段可回滚」，且为非破坏性（不提交(commit)、可完全撤销）。

**验证命令（非破坏性）**：

```
git revert --no-commit -m 1 <MERGE_HASH>
```

- 零冲突 → 回滚结构成立。
- 变更文档等冲突（因合并后补充提交(commit)也改了该文件）→ **预期内**，说明干净回滚需两步（见下）。

**立即恢复（必须）**：

```
git revert --abort
```

- 验证后**必须** `abort`，恢复干净工作树；不可遗留半回滚状态。

**两步回滚路径（固化进变更文档 Notes）**：若补充提交(commit) `<FIX_HASH>` 改了被合并文件：`git revert --no-commit <FIX_HASH>` 然后 `git revert --no-commit -m 1 <MERGE_HASH>`（**零冲突**，全部功能文件被移除）；两次 `git revert --abort` 均可完全恢复。或单步 `git revert -m 1 <MERGE_HASH>` 手动解冲突后提交(commit)。

### 17.10 阶段五：清理工作树(worktree)（按要求 / 条件）

**判定条件（唯一，全部满足才清理）**：

- 代码已合并：`git merge-base --is-ancestor <TIP> HEAD` 返回 `0`（合并碑第二父仍是主线(main) HEAD 祖先）。
- 工作树(worktree)无独特未跟踪产物（代码已在主线(main)保留）；若有用户想保留的未跟踪文件，**先备份**再清。
- 功能分支(branch)清理已完成或并行进行（见 `### 17.11 阶段六：清理分支(branch)（本地 + 远端，按要求 / 条件）`）。

**活跃工作树删除（gitdir 完好）**：

```
git worktree remove <WORKTREE_PATH>
```

- 要求：工作树(worktree)干净（无未提交改动）；否则先 `commit` / `stash` 或加 `--force`。

**失效游离工作树删除（gitdir 丢失）**：

- 判定：`git worktree list` **不登记**该路径 → 已游离（如外部同步 / 清理工具清空所致）。
- 删除：`rm -rf <WORKTREE_PATH>`（**不能**用 `git worktree remove`，因未登记）。
- ⚠️ 若操作系统对递归删除有拦截（如送回收站），确保确认已彻底移除；删除前确认已备份需保留的产物。

**验证（无歧义）**：

- 目录已消失。
- `git worktree list` 仅余主仓库。
- `git merge-base --is-ancestor <TIP> HEAD` 返回 `0`（代码未丢）。

### 17.11 阶段六：清理分支(branch)（本地 + 远端，按要求 / 条件）

> 通用分支(branch)清理的门禁与命令见 `### 17.11 阶段六：清理分支(branch)（本地 + 远端，按要求 / 条件）` ；本节为该工作流专用步骤。

**判定条件（唯一，全部满足才清理）**：

- 分支(branch)已合并（PR `MERGED` 或已 `--no-ff` 合入 `<BASE_BRANCH>`）。
- 删除不影响已 `MERGED` 的 PR（PR 关联基于**提交(commit)哈希**而非分支(branch)名；已 MERGED 的 PR 不因删分支(branch)悬空 / 关闭）。
- 与上游(upstream)无 open PR（删分支会令仍挂的 open PR 被 GitHub 自动关闭，须先暂停确认；自有仓库流程上游通常无此分支，`gh api repos/<UPSTREAM_OWNER>/<REPO>/branches/<BRANCH>` 返回 404，或用 `gh pr list --state open` 两条查询核验）。
- **已获得用户明确授权**（删远端分支(branch)属公开动作，硬禁令外仍须授权）。

**三步走（唯一顺序）**：

1. 本地分支(branch)引用：`git branch -d <BRANCH>`（不存在则报 `not found`，跳过）。
2. 本地远程跟踪：`git branch -d -r <REMOTE>/<BRANCH>`。
3. 远端分支(branch)：`git push <REMOTE> --delete <BRANCH>`（**需用户明确授权**；非强推，合规）。

**验证（无歧义）**：

- `git branch -a` 无 `<BRANCH>` 残留。
- `git ls-remote --heads <REMOTE> <BRANCH>` 输出为空。
- `git merge-base --is-ancestor <TIP> HEAD` 返回 `0`（提交(commit)未丢，仍在主线(main)历史，因合并碑第二父引用）。
- `git fetch --prune` 清理陈旧远程跟踪引用（可选）。

### 17.12 硬禁令与红线（唯一，不可逾越）

- 禁止 `git push --force` / `-f` / `--force-with-lease <REMOTE> <BASE_BRANCH>`（见 `## 第1章 全局禁令（最高优先级）`）。
- 禁止删除 `<REMOTE>/<BASE_BRANCH>` 分支。
- 合并与清理均**不改写历史**（无 `rebase -i` / `amend` 已推送提交(commit)）。
- 最高优先级约定区域冲突必须**暂停告知用户**，不得擅自丢弃。
- 删远端分支(branch)、打标签(tag)、创建 Release 属公开动作，**须用户明确授权**后执行。

### 17.13 验收闸门清单（四张，逐项打勾）

**合并前（ `### 17.8 阶段三：《--no-ff》 合并到主线(main)` 预检）**：

- [ ] `git fetch <REMOTE>` 完成
- [ ] `git checkout <BASE_BRANCH>` 且 `git status --porcelain` 为空
- [ ] `git merge-tree --write-tree <BASE_BRANCH> <REMOTE>/<BRANCH>` 零冲突预测
- [ ] 分支保护核验返回 `404`（无保护）或已改走 PR 流程
- [ ] 功能分支(feat) `<RUN_TESTS>` 零失败 + `<BUILD>` 成功

**合并后（ `### 17.8 阶段三：《--no-ff》 合并到主线(main)` 合并碑验证 + 合并后验证）**：

- [ ] 合并碑双父（`grep -c parent` = 2）
- [ ] `<TIP>` 是 HEAD 祖先（返回 0）
- [ ] 功能中间提交(commit)可见（`git log HEAD^2`）
- [ ] 四大约束验证矩阵（ `### 17.3 四大约束 ↔ 唯一验证矩阵`）全满足
- [ ] 变更文档(CHANGELOG)已补合并说明 + 回滚路径
- [ ] 版本号一致（若发版）
- [ ] `git push <REMOTE> <BASE_BRANCH>` 成功，CI 全绿

**清理工作树前（ `### 17.10 阶段五：清理工作树(worktree)（按要求 / 条件）`）**：

- [ ] 代码已合并（`merge-base --is-ancestor <TIP> HEAD` = 0）
- [ ] 工作树(worktree)无独特未跟踪产物（或已备份）
- [ ] `git worktree list` 确认活跃 / 游离状态，选对删除命令

**清理分支前（ `### 17.11 阶段六：清理分支(branch)（本地 + 远端，按要求 / 条件）`）**：

- [ ] 分支(branch)已合并（PR MERGED 或 `--no-ff` 合入）
- [ ] 上游(upstream)无 open PR（404）
- [ ] 已获用户删除远端分支(branch)授权
- [ ] 清理后 `merge-base --is-ancestor <TIP> HEAD` 仍返回 0（提交(commit)未丢）

### 17.14 完整命令清单（可复制模板）

> **兜底说明（脚本化封装）**：下列手写命令模板的等价、可复制执行封装，由 `github-personal-manager` 技能的 `scripts/sop_worktree_add.sh` / `scripts/sop_worktree_merge.sh` / `scripts/sop_worktree_cleanup.sh` 提供，已内置本清单全部安全约束（`--no-ff` 双父碑合并、冲突预测暂停、合并校验防丢提交、本地远程跟踪引用清理 `git branch -d -r`、dry-run 优先、脏区硬停）。**优先直接调用脚本**；本清单作为原理参考与脚本不可用时的兜底，所有脚本约束与 `## 第13章 13.6` 索引一致。

```
# ===== 参数（执行前填写）=====
# MAIN_REPO_PATH=<主仓库绝对路径>
# WORKTREE_ROOT=<工作树父目录>
# REMOTE=origin  BASE_BRANCH=main
# OWNER=<仓库归属>  REPO=<仓库名>
# BRANCH=feat/<topic>  TIP=<功能分支尖端哈希>  MERGE_HASH=<合并碑哈希>
# INSTALL_DEPS=<安装依赖命令>  RUN_TESTS=<测试命令>  BUILD=<构建命令>

# ===== 阶段一：开工作树 =====
git fetch <REMOTE>
git checkout <BASE_BRANCH>
git status --porcelain                  # 必须为空
git worktree add <WORKTREE_ROOT>/<topic> -b <BRANCH> <BASE_BRANCH>
cd <WORKTREE_ROOT>/<topic> && <INSTALL_DEPS>

# ===== 阶段二：工作树内开发测试 =====
cd <WORKTREE_ROOT>/<topic>
# ... 编码、多次提交(commit) ...
<INSTALL_DEPS> && <RUN_TESTS> && <BUILD>     # 全绿才合并
git push -u <REMOTE> <BRANCH>               # 持久化引用（推荐）

# ===== 阶段三：合并（在主仓库）=====
cd <MAIN_REPO_PATH>
git fetch <REMOTE>
git checkout <BASE_BRANCH>
git status --porcelain                  # 必须为空
git merge-tree --write-tree <BASE_BRANCH> <REMOTE>/<BRANCH>   # 零冲突预测
gh api repos/<OWNER>/<REPO>/branches/<BASE_BRANCH>/protection  # 404=可直推
git merge --no-ff <REMOTE>/<BRANCH> \
  -m "merge: <主题>（<BRANCH>）" \
  -m "来自 <REMOTE>/<BRANCH>，尖端 <TIP>" \
  -m "整段回滚：git revert -m 1 <MERGE_HASH>"
# 冲突→手动 Edit（禁 --ours/--theirs）→git add→git commit
git cat-file -p HEAD | grep -c parent     # 必须=2
git merge-base --is-ancestor <TIP> HEAD && echo OK
# 补 CHANGELOG.md + 版本一致 → git commit -m "docs: 补充 CHANGELOG 与版本一致性"
git push <REMOTE> <BASE_BRANCH>            # 触发 CI

# ===== 阶段四：回滚验证（可选，非破坏性）=====
git revert --no-commit -m 1 <MERGE_HASH>
git revert --abort                        # 必须撤销

# ===== 阶段五：清理工作树 =====
git merge-base --is-ancestor <TIP> HEAD && echo OK
git worktree list                         # 活跃→git worktree remove；游离→rm -rf
rm -rf <WORKTREE_ROOT>/<topic>            # 或 git worktree remove
git worktree list                         # 仅余主仓库

# ===== 阶段六：清理分支（需授权）=====
git branch -d <BRANCH>                    # 不存在跳过
git branch -d -r <REMOTE>/<BRANCH>
git push <REMOTE> --delete <BRANCH>       # 需用户授权
git branch -a                             # 无残留
git ls-remote --heads <REMOTE> <BRANCH>   # 空
git merge-base --is-ancestor <TIP> HEAD && echo OK
```

### 17.15 常见问题与唯一处置（通用化）

| 现象 | 根因 | 唯一处置 |
| ------ | ------ | ------ |
| git merge --no-ff -F <消息文件> 失败 could not read file | 外部消息文件路径不可写 | 改用多条 -m 传碑正文 |
| 合并时版本号 / 元数据冲突 | 功能分支(feat)漏升 / 与主线(main)分叉 | 统一目标版本，保留对方新增依赖 / 条目，手动 Edit |
| 锁文件两处冲突 | 根 version + 包列表双块 | 两处均解决为目标版本，保留依赖树，校验 JSON 有效 |
| 回滚变更文档冲突 | 合并后补充提交(commit)也改该文件 | 两步回滚（先 revert 补充提交再 revert 碑）或手动解冲突 |
| git worktree remove 报未登记 | 工作树(worktree)失效游离（gitdir 丢失） | 改用 rm -rf 递归删除（确认已备份需保留产物） |
| gh 命令指向错误远端 | 多 remote 默认解析 | 所有 gh 显式 --repo / |
| 删分支(branch)后 PR 消失 | 误以为 PR 关联分支(branch)名 | PR 关联提交(commit)哈希，已 MERGED 的 PR 不受影响 |
| 合并后无合并碑 | 误用 fast-forward / squash | 重做：确保 --no-ff；已推送则不要改写，另开说明 |

### 17.16 风险与反模式

| 反模式 | 后果 | 正确做法 |
| ------ | ------ | ------ |
| 用 squash 合并 | 丢中间提交(commit)、无合并碑、无法整段回滚 | 坚持 --no-ff |
| 用 rebase 合并 | 提交(commit)哈希改写、无合并碑 | 坚持 --no-ff |
| reset --hard + 强推回滚 | 违反禁强推规则、破坏协作 | 只用 git revert |
| 合并前不更新变更文档 | 发布无据、回溯困难 | 代码与文档成对提交(commit) |
| 多个工作树(worktree) checkout 同一分支(branch) | git 报错 overlaps | 一分支(branch)一工作树(worktree) |
| 任务改主线(main)后未同步基线 | 功能合并冲突堆积 | 合并前先同步最新主线(main) |

### 17.17 一句话方法论

**工作树并行写、普通合并留碑、测试合格才合、变更文档同步记、回滚只用 revert。**

---

## 第18章 工作流六 CI 失败排错

> 触发时机：`gh pr checks` 或 `gh run list` 出现失败（红），需定位原因并修复回推。原则：定位与修复属本地/功能分支(feat) 动作，助手自动执行；凡改动 workflow 文件、重推标签(tag) 等影响面较大的动作，先大白话说明再执行。多数具体坑见 `## 第12章 Fork CI 实证要点`，本章只给排错主线。
> 排错回到全局契约面裁决器：若 CI 红灯是「为过评审叠补丁」所致，先回全局契约面重画方案，而非继续串行打补丁。
>
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）。**

### 18.1 第一步 — 定位失败的 run 与 job

```
gh run list --limit 5                       # 列最近的 workflow run，找红的那个
gh run view <run-id>                         # 看该 run 各 job 状态
gh run view <run-id> --log-failed            # 只看失败步骤日志（首选，最省时）
gh run download <run-id> --log-failed        # 需要完整失败日志时下载到本地细读
```

- ⚠️ **CI 结论取数坑**：`gh run watch --exit-status` 的退出码会被 `| tail ; echo $?` 掩盖；应再用 `gh run view <run-id> --json conclusion --jq .conclusion` 明确取结论。clippy 在 `-D warnings` 下输出 `error:` 而非 `warning:`，故在日志里 grep `error:` 找 clippy 失败。

### 18.2 第二步 — 按类型对号入座（详见第12章对应条目）

| 失败现象 | 根因与去处 | 修复方向 |
| ------ | ------ | ------ |
| cargo fmt – --check 失败（Rust 项目适用） | 手写多行调用被 rustfmt 折叠（实证第10点） | 本地装 minimal + rustfmt 组件格式化，或靠临时 push-to-main CI 间接确认 |
| clippy -D warnings 报错（Rust 项目适用） | 如 useless_conversion（实证第9点） | 在 功能分支(feat) 改，git push origin feat 重验 |
| run 卡 action_required | fork→上游 PR 审批闸门（实证第1点） | 等上游维护者 Approve；验证改走 fork 内部 push:[main]（实证第2点） |
| 整条 CI 全红且与代码无关 | 勾了 “Require actions pinned to full-length SHA”（实证第8点） | 到 fork 规则设置取消勾选 |
| 发布类 job 失败 | fork 不该发布 [crates.io/PyPI（实证第6点）](http://crates.io/PyPI%EF%BC%88%E5%AE%9E%E8%AF%81%E7%AC%AC6%E7%82%B9%EF%BC%89) | 给发布 job 加 if: github.repository == ‘’ 守卫（⚠️ actionlint 拒绝纯常量 if: false，须用非常量仓库名比较） |
| create-release 抽 notes 失败 | CHANGELOG 缺版本段（实证第7点） | 顶部补 ## [X.Y.Z] - |

### 18.3 第三步 — 修复回推与重跑

- 代码/格式/clippy 类：改在 功能分支(feat) → `git push origin feat/<topic>` → CI 自动重跑（自动执行）。
- 仅需重跑（疑似偶发/外部因素）：`gh run rerun <run-id> --failed`（只重跑失败 job）或 `gh run rerun <run-id>`（自动执行）。

#### 18.3.1 git 推送 github.com:443 失败的两类情形（务必区分）

- **偶发瞬断（重试可过）**：`git push` 偶发 `github.com:443` 连接超时，用 for 循环重试 3~5 次可过；`gh` API 不受影响。
- **持续性重置（网络层封锁，重试无效）**：实测 `git push`/`git ls-remote` 报 `Recv failure: Connection was reset` 或 `Failed to connect to github.com port 443`，但 `gh api`（[api.github.com](http://api.github.com)）正常、且无任何代理变量。此时**不要重试 git**，改用 GitHub REST API 绕过 git 智能 HTTP 协议：

1. 改文件提交到 origin/main：取 blob SHA（`gh api repos/<repo>/contents/<path>?ref=main --jq .sha`）→ 本地 base64 → `gh api -X PUT repos/<repo>/contents/<path> --input payload.json`（payload={message, sha, branch:“main”, content}）；
2. 建/移标签（等价于推送标签，触发 `on: push: tags`）：`gh api -X DELETE repos/<repo>/git/refs/tags/<tag>` + `gh api repos/<repo>/git/refs -X POST -f ref=refs/tags/<tag> -f sha=<commit>`；
3. 多文件/大文件用 Node 脚本逐文件提交；注意 `jq` 在 Git Bash 不可用、且 `/tmp` 路径 Git Bash 与 Node 解析不一致（Node 解析为 `d:\tmp`）→ 直接用绝对 Windows 路径由 Node 读源文件。

#### 18.3.2 通用可移植方法论（某仓库四门禁级联复盘，脱敏）

实证：某 TypeScript 仓库发版连遇 actionlint/tsc/i18n/release-assets 四道门禁失败，全程靠上述 API 绕过（contents PUT + refs 删建）提交修复并移动标签，最终成功发布构建产物。

- **CI 多门禁是串行短路的**：每次只暴露第一个失败（actionlint→tsc→i18n→release-assets 依次触发），修一个重跑才暴露下一个；不要假设"一次改完"，需逐轮 `gh run view --log-failed` 确认下一个失败点再修。
- **i18n 类门禁查代码+注释**：`verify:i18n` 会审计源码与注释里的硬编码非英语文案（白名单除外）；修 bug 时注释也写英文，避免门禁失败。
- **升版本必须"三件套"同步**（Node/npm 项目适用）：`package.json`(顶层) + 子包 `package.json`(如 `packages/shell-host`) + `package-lock.json`(顶层/子包 version 字段) + 发布说明(`docs/releases/<ver>.md`) 必须同版本号；漏任一则 `verify:release-assets` 失败。改版本时一次性全改。
- **actionlint 拒绝纯常量 `if:`**：`if: false`/`if: true` 会被判 `constant expression` 错误；改用非常量条件（如 `if: github.repository == '<upstream>'`）或 `workflow_dispatch` 手动触发。
- 改 workflow 文件（加 `if: github.repository == '<upstream>'` 守卫、调 pinned 规则）或删/重推标签(tag)：属影响面较大的动作 → 先大白话说明改什么、为什么，再执行。⚠️ 勿用纯常量 `if: false` 守卫——actionlint 会报 `constant expression "false" in condition` 致整条 CI 失败。

---

## 第19章 工作流七 Release 发版

> 触发时机：需要构建二进制产物或正式发版时。**硬前提**：fork 发版仅用于自取构建产物，**绝不**发布到 [crates.io](http://crates.io) / PyPI（见 `## 第12章 Fork CI 实证要点` 第6点）。打标签(tag) 会触发 CI 并生成 Release，属公开动作 → 先说明将推的版本，暂停等指令。
>
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）。**

### 19.1 第一步 — 发版前检查（缺一不可）

- CHANGELOG 顶部有对应 `## [X.Y.Z] - <date>` 段（实证第7点），否则 `create-release` 抽 notes 失败。
- `release.yml` 中**发布类 job**（如 `publish-to-crates-io`/`pypi`/`build-python-wheels` 等，取决于该仓库所用语言与发布通道）已加 `if: github.repository == '<upstream>'` 守卫（fork 上求值 false 自动跳过、上游上 true 正常发布），仅保留 `create-release` + `build-release`（实证第6点）。⚠️ 禁止写成纯常量 `if: false`（actionlint 拒绝）。
- 未勾 “Require actions pinned to full-length SHA”（实证第8点）。
- fork Settings→Actions→Workflow permissions = Read and write（`gh release create` 需 `contents: write`，实证约束）。
- ⚠️ **变更范围复核**：发版前用 `git diff <上一 tag> <本次 tag> --stat`（如 `git diff v1.2.0 v1.3.0 --stat`）快速锁定本次发版到底改了哪些文件、增删行数，确认无遗漏/误含；线上出问题时也可同法（`git diff <昨晚commit> <现在commit> --stat`）先圈定影响文件，再深入具体改动。如需看单文件差异，去掉 `--stat` 或追加路径：`git diff <tag1> <tag2> -- src/login.js`。

### 19.2 第二步 — 打标签(tag) 触发（公开动作，暂停等指令）

```
git tag -a v<version> -m "release v<version>"
git push origin v<version>                          # release.yml: on: push: tags:['v*'] 触发
```

- 需重新触发（同版本重跑）：先删远端标签(tag) 再重推 → `git push origin :refs/tags/v<version>` → `git push origin v<version>`（见 `## 第12章 Fork CI 实证要点` 第3点）。**禁止用 `git push --force-with-lease origin v<version>` 强推标签**，以免与"禁止强推 main"禁令混淆。
- ⚠️ **标签 SHA 核对坑**：`git ls-remote --tags origin vX` 返回的 SHA 是**注解标签(tag)对象本身**的编号，不是它指向的提交(commit)编号。核对"标签是否已推送/指向是否正确"时，必须先用 `git rev-parse <tag>^{commit}`（或 `git rev-list -n 1 <tag>`）解引用出提交(commit) SHA 再与本地对比；切勿直接拿 `ls-remote` 的 SHA 与 `git rev-list` 的提交(commit) SHA 比较，否则会误判为"标签错位/未推送"。
- **门禁**：推标签(tag) 前，先大白话说明要发的版本号、将触发哪条工作流、产物是什么，暂停等你确认。

### 19.3 第三步 — 监控与取产物

```
gh run watch                                        # 等 Release 工作流跑完
gh release view v<version>                           # 查看 Release 与 assets 清单
gh release download v<version>                       # 下载构建产物（含 Windows 二进制）
```

- 无工作流自动发布、需手动建 Release 时：`gh release create v<version> --generate-notes` + `gh release upload v<version> <产物文件>`。

---

## 第20章 工作流八 分支清理回收

> 触发时机：功能分支(feat) 已合并(merge)（上游合并或自有 PR 合并）或确认废弃后回收。**删除不可逆**，故删除类动作一律：先列清单（合并状态 + PR open 状态两维）→ 暂停等你确认 → 才删（强门禁）。**删分支前须先查该分支是否仍挂 open PR（ `### 20.1 第一步 — 识别可清理分支` 两条 `--state open` 查询），以防删除令对应 PR 被 GitHub 自动关闭。**
>
> **启动前必须先完成路径核验（ `## 第10章 路径核验`）。**
>
> 多工作树(worktree) 场景的分支清理专用步骤（含工作树(worktree)失效游离的 `rm -rf` 处置）见 `### 17.11 阶段六：清理分支(branch)（本地 + 远端，按要求 / 条件）`。

### 20.1 第一步 — 识别可清理分支

```
git branch --merged main                            # 本地已合并进 main 的分支（可安全删）
git branch --no-merged main                         # 本地未合并分支（含未完成工作，勿删）
gh pr list --repo <upstream> --author zhangweildlh --state merged   # 确认你的 PR 已合并（在结果中核对 feat/<topic> 源分支）
git branch -r --merged origin/main                  # fork 远程已合并分支
gh pr list --repo <upstream>          --author zhangweildlh --state open   # 反向保护·盲区一：查上游仓库(upstream) 开放(open) PR——待删分支若仍挂 open PR，删除会令其被 GitHub 自动关闭，须先按 20.3 暂停确认
gh pr list --repo zhangweildlh/<fork> --author zhangweildlh --state open   # 反向保护·盲区二：查 fork 内部开放(open) PR（fork 内部 PR 多用于触发 fork CI，合并后即废）——同须先按 20.3 暂停确认
```

### 20.2 第二步 — 清理（删除类动作，暂停等指令）

- 本地：`git branch -d feat/<topic>`（小写 `-d` 只删已合并分支；未合并会被拒绝，**绝不**擅自用 `-D` 强删）。
- fork 远程：`git push origin --delete feat/<topic>`。
- 清理陈旧远程跟踪引用：`git fetch --prune`（或 `git remote prune origin`）——只清本地过时引用、不动远程分支，**可自动执行**。

### 20.3 强门禁（删除专属）

- 只删「已确认合并(merge) 或你明确指定废弃」的分支；删除前先列出待删清单及各自**合并状态 + PR open 状态两维**，暂停等你确认。
- **PR open 状态门禁（盲区三·反向保护）**：任何待删分支若仍关联 open PR（无论上游仓库(upstream) 还是 fork 内部 `zhangweildlh/<fork>`），**一律暂停**并明确告知：删除该源分支将使对应 PR 被 GitHub 自动标记为 Closed（即 PR 悬空）。须等你确认「先合并/关闭该 PR」或「明确废弃该分支并连带关闭 PR」后，方可删除。判定依据为  `### 20.1 第一步 — 识别可清理分支` 的两条 `--state open` 查询。
- `main` 永不删；当前所在分支不删。
- 优先 `git branch -d`（拒删未合并）；`-D` 强删仅在你明确点名某分支后才用。

### 20.4 工区内部对象回收（git gc / reflog / 悬空提交）

> 分支删除后，git 内部可能残留无引用的「悬空对象」（如误产生的根提交、游离 commit）。按需回收以释放空间、保持仓库整洁。

- **现象**：`git gc --prune=now` 后 `git fsck --no-reflogs --unreachable` 仍列出悬空 commit/tree/blob。
- **根因**：`git gc` 默认**遵守 reflog 保留期**，若本地 HEAD/分支 reflog 仍引用这些对象，gc 不会回收它们（即使已无分支指向）。
- **正确回收（两步）**：先 `git reflog expire --expire=now --all`（清除本地所有 reflog 恢复点——仅影响本地恢复能力、不丢任何可达代码）→ 再 `git gc --prune=now` → 复验 `git fsck --no-reflogs --unreachable` 应为空。
- **可复用经验**：凡遇 `git gc` 不回收、悬空对象仍在，先怀疑 reflog 引用挡路，补 `reflog expire --expire=now --all` 一步即可彻底回收（已实战验证于某仓库清理：异常根提交经此两步回收成功）。

---

## 第21章 工作流九 PR 全生命周期操作

> **定位**：跨项目、可复用。统一覆盖「本地仓库 + 远端仓库」的一切 Pull Request 操作——开新 PR 前的三核验、本地↔origin↔upstream 对齐、重复 PR 检查、查询并遵循上游 PR 规范、开新 PR、PR 审查意见回应（含多轮）、合并、其他 PR 操作、收尾清理。本工作流排序为第五篇「工作流九」，位于「工作流八 分支清理回收」之后、「工作流十 清理工区维护」之前。
>
> **单一事实源原则（强制）**：本工作流只定义"PR 全生命周期"的**编排顺序与 PR 专属要求**。凡路径核验、技能激活、本地↔origin↔upstream 对齐、开 PR 命令、文档门禁、CI 轮询、合并、分支清理等**他章已定义的命令/约束/步骤**，一律以「→ 第X章」方式**引用（调用）**，**不在本重复写**。禁止循环引用：本工作流引用他章，他章不反向引用本工作流（仅顶部速查索引表、第9.6 索引作单向导航，不构成逻辑回环）。
>
> **启动前强制门禁（任何 PR 操作的第一步，不可跳过）**：
>
> 1. 先按 **第13章** 激活 `github-personal-manager` 技能（GitHub 工作流总闸门）；
> 2. 再按 **第10章** 完成路径核验（未核验路径不得进入任何后续步骤）；
> 3. 严守 **第1章** 硬禁令（绝不强推/删 `origin/main` 等受保护分支；只推 `origin`，绝不推 `upstream`）。

### 21.1 阶段 0 — 前置门禁（引用，不重复定义）

- **技能激活**：→  `### 13.1 激活判定`–`### 13.6 激活后执行点索引`（含  `### 13.6 激活后执行点索引` 脚本索引与"路径无关"加载约定）。
- **路径核验**：→  `### 10.1 规则一：先核验"要操作的目录"再动手`–`### 10.4 规则四：发现异常先问，对齐后再做`（三步核验顺序、误报铁律、异常先问）。
- **硬禁令红线**：→  `### 1.1 禁止强推/删除自家 main（及受保护分支）`（禁强推/删 main）、 `### 1.2 二次显式授权铁律`（二次授权铁律）、 `### 1.3 入库隐私闸门（2026-08-04 实测拦截后确立）`（入库隐私闸门）。
- **仓库三元组解析**：→  `### 13.6 激活后执行点索引``scripts/sop_resolve_repo.sh <仓库路径>`（提取 GH_USER/REPO_NAME/UPSTREAM）；或 `git remote -v` 自行确认 origin/upstream 指向。本工作流 `<upstream>` 一律从此解析（如 deepseek-pp 实为 `zhu1090093659/deepseek-pp`，非 `deepseek-ai`）。

### 21.2 阶段 1 — 开新 PR 前的三核验

开新 PR 前必须依次通过三道核验，任一不过则先修复/暂停，不进入开 PR。

**① 路径核验（引用）**：→  `## 第10章 路径核验` 。确认当前操作目录确为目标仓库根（`ls "<目录>/.git"` + `git -C "D:/..." rev-parse --show-toplevel`）。

**② 分支核验（PR 专属，聚焦）**：确认"将作为 PR 源分支(feature branch)"的状态正确：

- `git rev-parse --abbrev-ref HEAD` 确为预期 `feat/<topic>`（非 `main`、非游离 HEAD）；
- **born 检查**（防根提交异常，引用 `### 16.2 阶段 1 同步与建分支`）：`git rev-parse HEAD` 须解析出有效 SHA、有父提交；若 `unknown revision` → 先 `git reset --mixed main` 修复，绝不直接 `git add -A && git commit`；
- 分支已推到 你的远端仓库(origin)：`git rev-parse --abbrev-ref HEAD@{upstream}` 应为 `origin/feat/<topic>`；未推则先 `git push -u origin feat/<topic>`（引用 `### 16.3 阶段 2 提交 / 推送 / 触发 CI`）；
- 工作区干净（无未提交改动）：`git status --porcelain` 应为空；脏则先提交或 stash，否则不开 PR。

**③ 本地 ↔ origin ↔ upstream 对齐（引用）**：按 `### 15.2 第一步 — 本地 ↔ 你的远端仓库(origin)`–`### 15.3 第二步 — 你的远端仓库(origin/fork) ↔ 上游仓库(upstream)`完成对齐，确保 PR 基于最新 `main`：

- 本地 main 与 origin/main：仅落后/领先→快进拉取/推送（引用 `### 15.2 第一步 — 本地 ↔ 你的远端仓库(origin)`）；
- origin/main 与 upstream/main：M>0,K>0 冲突→暂停；M=0,K>0→跟随上游（引用 `### 15.3 第二步 — 你的远端仓库(origin/fork) ↔ 上游仓库(upstream)`）；
- **关键**：开 PR 前必须 `git fetch upstream && git rebase upstream/main feat/<topic>`（或 merge），保证源分支基于最新上游 `main`（呼应上游 `CONTRIBUTING` 第1条"Base the work on the latest code"）。

### 21.3 阶段 2 — 重复 PR 检查（引用 + PR 专属口径）

开新 PR 前，先验是否已存在相同/重叠的开放 PR，避免重复开 PR。

- **查询口径（PR 专属，引用 `### 15.3 第二步 — 你的远端仓库(origin/fork) ↔ 上游仓库(upstream)`）**：一律用**作者口径**，弃用 `--head` 窄口径：

```bash
gh pr list --repo <upstream> --author zhangweildlh --state all
```

- ⚠️ 口径区别（引用 `### 15.3 第二步 — 你的远端仓库(origin/fork) ↔ 上游仓库(upstream)`）：`--head zhangweildlh:main` 只匹配源分支恰叫 `main` 的 PR，会漏掉 `feat/*`/`fix/*` 分支的 PR；`--author zhangweildlh` 按作者匹配，返回我开的全部 PR，不漏判。仅在查"main→main 通道"时才叠加 `--head`。
- **判定**：
- 已有 open PR 覆盖同一改动 → **不重复开**，直接在那条 PR 上更新（追加提交/编辑正文）；
- 已有 rejected（closed 未合并）PR → 视为  `### 15.4 冲突处理（六类问题）`问题四，按反馈改后开新 PR（暂停等指令）；
- 无 PR → 进入阶段 3/4 开新 PR。

### 21.4 阶段 3 — 查询并遵循上游仓库对 PR 的要求与规范（PR 专属，新内容）

开 PR 前必须先用 `gh` 读取**上游仓库(upstream)** 的 PR 规范与 CI 门槛（引用 `## 第14章 工作流二 信息读取与搜索` gh 优先原则），确保 PR 正文与改动满足上游验收。

**① 读取上游 PR 规范文件（gh 优先）**：

```bash
# 上游 CONTRIBUTING（贡献要求）
gh api repos/<UPSTREAM_OWNER>/<REPO>/contents/CONTRIBUTING.md -q .content | base64 -d
# 上游 PR 模板（正文结构）
gh api repos/<UPSTREAM_OWNER>/<REPO>/contents/.github/pull_request_template.md -q .content | base64 -d
# 上游 CI/PR 校验工作流（必过的检查）
gh api repos/<UPSTREAM_OWNER>/<REPO>/contents/.github/workflows --jq '.[].name'
# 逐个读取，提取必过 job（如 ci.yml 的 npm run ci:quality）
gh api repos/<UPSTREAM_OWNER>/<REPO>/contents/.github/workflows/ci.yml -q .content | base64 -d
```

- 解码：GitHub `contents` API 返 base64，Git Bash 下用 `base64 -d` 解码（引用 `### 14.4 跨命令通用约束`）；`gh` 不可用/无权限时回退 WebFetch（引用 `### 14.2 优先顺序（硬规则）`回退条件）。

**② 上游 PR 规范检查清单（按上游文件逐项核对）**，至少覆盖：

- 是否基于最新 `main`（rebase/merge 上游最新后再开）；
- PR 是否聚焦（不混入无关功能/依赖杂务/文档大改）；
- 是否跑本地校验（如 `npm run compile` / `npm run ci:quality`），并准备命令与结果；
- 是否需附 user-facing 证据（截图/录屏）；
- 是否禁止隐藏失败（如实报告失败与局限）。

**③ 实证实例（deepseek-pp，作为本流程的具象参照，非普适规则）**：

- 上游(真实) = `zhu1090093659/deepseek-pp`；CI = `ci.yml` 跑 `npm run ci:quality`（Node 22，`pull_request` 触发）；
- `CONTRIBUTING.md` 五条：`基于最新 main` / `PR 聚焦` / `跑本地校验` / `user-facing 附证据` / `不隐藏失败`；
- `pull_request_template.md` 六段：Summary / PR Type / Latest Codebase Confirmation / AI Coding Disclosure / Local Validation / Local Feature Evidence；
- `pr-contribution-rules.yml` 硬闸门（`pull_request_target`，跳过 draft）：校验 PR 正文——`PR Type` 至少勾一项、`Latest Codebase Confirmation` 必须勾选指定行、`Local Validation` 的 Commands run + Result summary 必填；**外部贡献者(user-facing PR) 必须附证据图（截图/录屏/Markdown 图/URL），否则 `core.setFailed` 使 PR 检查失败**。

→ 推论：向该上游开 PR 时，zhangweildlh 是**外部贡献者**（非仓库 owner），user-facing PR **必须**在 `Local Feature Evidence` 段附截图，否则 CI 红灯。此即本工作流  `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）` ⑤.6「截图与上传」的由来。

### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）

- **开 PR 命令（引用 `### 16.3 阶段 2 提交 / 推送 / 触发 CI`）**：
- 向 上游仓库(upstream) 贡献：`gh pr create --repo <upstream> --head zhangweildlh:feat/<topic> --base main`
- fork 内部 PR（触发 fork CI）：`gh pr create --repo zhangweildlh/<fork> --head zhangweildlh:feat/<topic> --base main`
- ⚠️ 多 remote 口径坑（引用 `### 16.3 阶段 2 提交 / 推送 / 触发 CI`）：一律显式带 `--repo`，避免默认取 upstream 报 “No commits between…”。
- ⚠️ PR 正文用 `--body-file`（引用 `### 16.3 阶段 2 提交 / 推送 / 触发 CI`）：先写正文到文件再 `gh pr create --body-file <file>`，避免中文括号被 bash 解析失败。
- **PR 正文必须包含（引用 `### 21.4 阶段 3 — 查询并遵循上游仓库对 PR 的要求与规范（PR 专属，新内容）`上游规范）**：
- 严格套用上游 `pull_request_template.md` 的段落结构（如 Summary / PR Type / Latest Codebase Confirmation / AI Coding Disclosure / Local Validation / Local Feature Evidence）；
- 显式声明本次**契约边界**（覆盖到哪、不覆盖到哪、剩余边界为何）——呼应 `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）`⑤.4 分阶段手册「提交 PR 时」的 PR 描述要求；
- user-facing 改动：在 Evidence 段附截图（方法见 `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）` ⑤.6）。
- **文档同步门禁（引用 `## 第11章 提交前文档同步门禁` 文档同步门禁 + 第13章 13.6 `sop_docs_sync_check.sh` 脚本索引）**：提交前 Tier 1（README/CHANGELOG）必须同步，未同步不得直接提交/开 PR。
- **触发并轮询 CI（引用 `### 9.3 Pull Request（《gh pr》）``gh pr checks`/ `gh run list` +  `### 13.6 激活后执行点索引``sop_pr_checks.sh` 轮询脚本）**：`gh pr checks` / `gh run list` 必须全绿；CI 触发条件以各仓库 `.github/workflows/` 为准（引用 `### 16.3 阶段 2 提交 / 推送 / 触发 CI`注）。

### 21.6 阶段 5 — PR 审查意见回应（核心，含多轮）（PR 专属，新内容）

收到评审（review comment / review request-changes / inline comment）后，按以下顺序回应。**先对齐、再查实、后修改、再回答、最后截图与上传**；多轮迭代回到本阶段开头整体重画，绝不叠补丁。

**⑤.1 拉取并核对评审意见（引用 `### 9.3 Pull Request（《gh pr》）``gh pr` 命令）**：

```bash
gh pr view <PR编号> --comments          # 评论 + 评审总览
gh pr diff <PR编号>                      # 当前 PR 差异（自审基准）
gh api repos/<upstream>/pulls/<PR编号>/reviews  # 逐条 review 决定
```

- 区分三类意见：**A 真问题（须改）/ B 边界澄清（文档即可）/ C 误判（用裁决器驳回）**（呼应 `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）`⑤.4 分阶段手册「收到评审回复时」的分类）。

**⑤.2 先对齐：当前分支正确性检查（PR 专属，防改错分支）**：

- `git rev-parse --abbrev-ref HEAD` 必须等于该 PR 的源分支（`feat/<topic>`）；
- 核对 PR 的 headRefName：`gh pr view <PR编号> --json headRefName` 应与本地当前分支一致；
- 不一致 → 先 `git switch feat/<topic>` 或 `git checkout -b feat/<topic> origin/feat/<topic>` 对齐，**绝不在错误分支上改**；
- 分支须已推 origin 且与 PR 关联（引用 `### 21.2 阶段 1 — 开新 PR 前的三核验` ②）。

**⑤.3 检查实际代码内容，避免悬空回应与错误回应（PR 专属，关键）**：

- **定位评审点真实代码**：用 `gh pr diff` / `git diff main...HEAD` / `Read` 实际文件当前行，**以真实代码为唯一基准**，不以记忆或旧 diff 假设；
- **逐条对照**：确认评审 comment 指向的行/函数/语义在**当前代码**中仍存在且未被改；若已不存在/已变 → 属"悬空回应"风险，先在评论中说明"该点已在 <提交> 处理/代码已重构"，不盲目改；
- **避免错误回应**：回答"已修复"前，必须 `git diff` 复核改动确实落地、且 `gh pr diff` 能看到该变更；禁止声称已改但实际未改；
- **整体核对**：将本条评审与  `### 21.2 阶段 1 — 开新 PR 前的三核验`/ `### 21.3 阶段 2 — 重复 PR 检查（引用 + PR 专属口径）`/ `### 21.4 阶段 3 — 查询并遵循上游仓库对 PR 的要求与规范（PR 专属，新内容）` 已确认的契约面、其余评审项耦合一起看，避免"只盯这一条"。

**⑤.4 代码修改标准（完整裁决器 + 全局契约面 + 全仓库整体性视角）**〔本步骤是 PR 全生命周期中**一切代码修改**（开新 PR 准备 + 评审回应 + 迭代复提交）的唯一标准〕：

> **最高视角（用户强制要求）**：任何代码修改都**从整个仓库代码的整体性、全局性出发**——先置于全仓库语境评估，而非只盯被点名的一行/一处；必要时联动验证其余调用点/模块/构建/CI/文档声明。

**一、红线层（六条铁律，不得违反）**：

1. **不得叠补丁（no patch-on-patch）**：禁止为消一个红灯再叠一个补丁的串行敷衍；每轮修改前先回到全局契约面重画方案。
2. **不得覆盖不全（no under-coverage）**：修复必须覆盖该问题的全部触发路径与边界，不留"文档声称但代码不到 / 代码到了但场景不全"的缺口。
3. **不得过度覆盖违反契约（no over-coverage violating contract）**：修复不得扩大作用域超出问题本质与既定契约/语义，不得为修 A 而误伤 B 的契约。
4. **不得修补旧问题的同时制造新漏点（no fixing-old-opening-new）**：每个改动必须显式校验"是否引入新红灯 / 新漏点"，纳入同一 diff 一并修复或回退。
5. **不得修一个漏一个（no fix-one-leak-another）**：评审项之间、调用点之间彼此耦合；改一处须联动验证其余所有相关项与调用点，不允许"过掉被点名项、牺牲未点名项"。
6. **必须有统一优先级裁决器 + 全局高度**：动手前先定"裁决器"并画出全局契约面，否则不下改。

**二、统一优先级裁决器（Unified Priority Arbiter，固定优先级顺序裁决冲突：覆盖 vs 契约 vs 最小改动）**：

1. **契约保真（contract fidelity）** 最高：不破坏既有语义与对外契约（含文档声明、调用方预期、评审已共识的语义）。
2. **正确性（correctness）**：修复的问题在全部触发路径与边界上确实正确。
3. **覆盖完整性（coverage completeness）**：无遗漏路径 / 场景（针对"该问题"本身，不外延）。
4. **最小作用域（minimal scope）**：在满足上三者的前提下，改动面尽量小、不波及无关调用点。
5. **可观测 / 可验证（verifiable）**：改动能被测试或证据闭环验证。

- **裁决示例**：当"扩大覆盖"会"违反契约(优先级1)"时 → **宁缩小覆盖、保契约**，并在评审/文档中明确标注剩余边界（"覆盖不全"也须是主动、明示、有契约依据的不覆盖）；当"修 A"会"误伤 B 契约"时 → 必须同一 diff 内同时修 B 或回退 A 的越界部分。

**三、全局契约面（动手前必画，作为后续所有决策的唯一事实源）**：

- 被改函数 / 模块的**既有语义**（对外契约）；
- 全部**调用点**与调用方预期；
- **文档声明**（接口文档 / [SKILL.md](http://SKILL.md) / 注释 / PR 描述）；
- 评审已共识的语义边界；
- 耦合的其它模块 / 评审项（改 A 会牵动谁）；
- 〔全仓库整体性强化〕**全仓库影响面**：本改动对全仓库其它模块、构建、CI、文档、公共 API 的连带影响。
- 未画完契约面、未定位根因前，不下改。

**四、分阶段操作手册（明确且唯一的执行步骤，须按序执行，不得跳步、不得只做被点名那一项）**：

- **接到"修改代码 / 修 BUG"任务时**：① 写出本任务的裁决器（把五优先级映射为本次"契约保真指什么 / 正确性指什么 / 覆盖到哪"）；② 画全局契约面，逐项填全；③ 定位根因（根因修复而非仅消红灯的表象修补）；④ 定方案（明确"覆盖到哪、不覆盖到哪、为何"，写入任务笔记作为与评审对齐基准）。
- **写代码 / 改代码时**：① 按方案改，改动面控制在最小作用域；② 每改一处，立即回到契约面，联动核对其余全部调用点/文档声明/耦合项，确认未引入新红灯、未误伤 B 契约（红线③④⑤）；③ 文档与代码同改同审（声明与语义必须一致，禁止"文档过度承诺、代码覆盖不全"或反向错位）。
- **提交 PR 时**：① PR 描述显式声明本次**契约边界**（覆盖到哪、不覆盖到哪、剩余边界为何）；② 确认文档代码已同改、本地全量验证（相关测试 + compile + 既定 CI 目标集）通过；③ 单一收口提交，不为"预留给某条评审"开空补丁提交（红线①）。
- **收到评审回复（PR reply）时**：① 逐条把评审项分类 **A 真问题（须改）/ B 边界澄清（文档即可）/ C 误判（用裁决器驳回）**；② 同一 diff 内一次性收口所有 A 类 + 其联动项，禁止"只改被点名那一项、牺牲未点名项"（红线⑤）；③ 回复时每条引用裁决器结论（为何扩/缩/保契约），不空泛认错；④ **绝不因单条评审新开一个串行补丁提交**（红线①），若需调整作用域回到"接到任务"步重画方案后同 diff 处理。
- **多次复提交（迭代）时**：① 每轮复提前，回到裁决器 + 全局契约面**整体重画方案**，而非在上一轮补丁上再叠（红线①）；② 若发现上轮改动越界/漏点，在同分支 amend/squash 收口，保持 PR 单一连贯。

**五、反模式速查（脱敏通用版，来自真实复盘）**：

- **无统一裁决器**：每次只针对"被点名那一项"打补丁，缺乏裁决"覆盖广度 vs 契约保真 vs 最小改动"的全局标准 → 局部正确、彼此冲突。
- **补丁叠补丁**：一路串行打 commit，每个只为消上一个 commit 引出的新红灯，从未停下来重画全局契约。
- **两极摇摆（覆盖不全 ↔ 过度覆盖）**：文档先过度承诺覆盖，代码又过度覆盖误伤其它契约，再靠回退在两极间横跳。
- **修一漏一 / 修旧造新漏**：为过某评审项扩大命中范围，却让合法精确情形被泛词误杀；用前瞻/正则修一处，又影响另一处提取。
- **无全局视野**：只盯当前这条 review comment，没先画"整个契约面 + 所有调用点 + 所有评审项耦合"，导致局部最优、全局震荡。

**六、与上游规范 / 文档的衔接（本步骤内闭环，不向外章回引）**：文档与代码同改同审（声明与语义一致）；改完即验证（有工具链则跑 lint/test，否则开 PR 触发 CI + 严谨 diff 自审）。开新 PR 准备阶段的代码修改亦须遵循本 ⑤.4 标准（引用 `### 16.1 阶段 0 启动前闸门`静态校验 lint/test；引用 `## 第11章 提交前文档同步门禁`）。

**⑤.5 文案回答（引用 `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）`⑤.4 分阶段手册「收到评审回复时」精神 + PR 专属）**：

- 每条评审逐条回应，引用**裁决/契约结论**（为何扩/缩/保契约），不空泛认错；
- A 类：说明改了哪、如何验证；B 类：文档澄清即可，附链接/段落；C 类（误判）：用全局契约面/裁决器依据**有理有据驳回**，不硬改；
- 多轮：同一 diff 内一次性收口所有 A 类 + 联动项，不在上一轮补丁上再叠（呼应 `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）`⑤.4 分阶段手册「收到评审回复时/ 多次复提交」）。

**⑤.6 截图与上传（user-facing 证据，PR 专属）**：

- **何时必须**：上游规范要求 user-facing 证据（如 deepseek-pp `pr-contribution-rules.yml` 对外部贡献者），或 PR 含 UI/功能/权限/流程变更。
- **方法 A（推荐，Web UI）**：在 PR 正文编辑页 / 评论框直接 Ctrl+V 粘贴或拖拽截图 → GitHub 自动上传并返回 `![](https://github.com/user-attachments/assets/<uuid>)`，嵌入 `Local Feature Evidence` 段。
- **方法 B（CLI 兜底，公开 fork）**：将截图放入 `assets/pr-evidence/<PR>-<描述>.png` → `git add` + `commit` + `git push -u origin feat/<topic>` → PR 正文引用公开 URL `https://github.com/zhangweildlh/<fork>/raw/<branch>/assets/pr-evidence/<file>.png`（公开 fork 上游可看；私有 fork 用方法 A）。
- 截图内容须满足上游证据要求（如 deepseek-pp：扩展从最新代码加载、功能启用、成功使用、可见结果、agent loop 反馈）。

**⑤.7 推送更新 PR（引用 `### 16.3 阶段 2 提交 / 推送 / 触发 CI`提交/推送）**：

```bash
git add <改动文件> && git commit -m "回应评审：<要点>"   # 单一收口提交，不空补丁
git push origin feat/<topic>                            # 普通推送更新 PR
# 若源分支需对齐最新上游（非 main）：
git fetch upstream && git rebase upstream/main feat/<topic> && git push --force-with-lease origin feat/<topic>  # 仅强推 feat，绝不强推 main
```

- 重跑 CI 至全绿（`gh pr checks`）。

**⑤.8 多轮审查迭代**：

- 每轮回到 ⑤.1，整体重画方案后同 diff 处理（不叠补丁，引用 `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）`⑤.4 分阶段手册「多次复提交」）；
- 若发现上轮越界/漏点，在同分支 amend/squash 收口，保持 PR 单一连贯。

### 21.7 阶段 6 — PR 合并（引用）

- 贡献 upstream：由上游维护者合并，助手仅监控，不得自行合并（硬约束，引用 `### 21.7 阶段 6 — PR 合并（引用）`）；
- 自有仓库/自测 PR：`gh pr merge`（引用 `### 9.3 Pull Request（《gh pr》）` + `### 21.7 阶段 6 — PR 合并（引用）`）；
- fork 内部 PR（仅触发 CI）：`gh pr merge --squash`（引用 `### 21.7 阶段 6 — PR 合并（引用）`）；
- 合并前冲突/分支保护：引用 `## 第17章 工作流五 多工作树并行开发（–no-ff 普通合并特化）`（多工作树）或  `### 15.4 冲突处理（六类问题）`（冲突决策树）。

### 21.8 阶段 7 — 其他 PR 操作（引用 `### 9.3 Pull Request（《gh pr》）`，补用法）

- 关闭 PR：`gh pr close <编号>`（弃用/重复时；fork 内部仅用于 CI 验证的 PR 可关）；
- 重开：`gh pr reopen <编号>`；
- 编辑正文/标题：`gh pr edit <编号> --title "..." --body-file <file>`；
- 转 draft / 标 ready：`gh pr ready <编号>`；
- 查看差异/状态：`gh pr diff` / `gh pr checks` / `gh pr view`；
- 作为评审人审他人 PR：`gh pr review <编号> --approve | --request-changes | --comment`（引用 `### 9.3 Pull Request（《gh pr》）`）；
- 评论互动：`gh pr comment <编号> --body "..."`（含证据图链接，见 `### 21.5 阶段 4 — 开新 PR 的规范操作（引用 + PR 专属补充）` ⑤.6）。

### 21.9 阶段 8 — 收尾与清理（引用）

- 合并后同步：`git switch main && git pull upstream main && git push origin main`；
- 分支清理：引用 `## 第20章 工作流八 分支清理回收`（已合并分支本地+fork 远程删除、prune 陈旧引用；删前确认 PR 非 open，避免误关 PR，引用 `### 20.3 强门禁（删除专属）`）；
- 工区清理：截图 / 构建产物 / 临时测试文件一律**先搜列、后确认、再删除**（不自动删；Git 分支删除不在此项内）。

### 21.10 强门禁总述（PR 全生命周期）

- 仅「路径核验通过 + 分支/对齐通过 + 重复 PR 已排除 + 上游规范已遵循 + 正文合规 + CI 全绿」的 PR 可开/可合；
- 一切冲突、公开动作（强推 feat 需 `--force-with-lease` 二次确认、合并受保护分支走 PR、删分支前 PR 状态核验）一律大白话 + 后果 + 暂停等指令（呼应 `### 13.6 激活后执行点索引`强门禁）；
- 本工作流不重复定义他章已覆盖的命令/约束，凡涉及一律"引用"；他章不反向引用本工作流（无循环引用）。

---

## 第22章 工作流十 清理工区维护

> 适用触发：你明确要求「清理工区」。本章定义"可删除文件"的范围，并规定**先搜索列出明细、等你确认、再删除**的强门禁；本流程只处理"工区文件"清理。

### 22.1 可删除文件定义（清理工区时的目标集）

以下类型**一律视为可删除文件**（**不含**  `### 22.3 必须保留与受保护清单（清理工区永不删）` 必须保留/受保护的对象——即源码、配置依赖、`README.md`/`LICENSE`/`CHANGELOG.md`、`.github/`、`.git/`、`.workbuddy/`、冒烟测试文件；其中"阶段性报告"明确属可删除，不归入受保护文档）：

- **垃圾文件 / 无用文件 / 过期文件**：临时缓存、废弃草稿、重复副本、失去时效的临时物。
- **阶段性报告 / 阶段性实施计划**：某阶段交付后不再需要的过渡性报告稿与实施计划稿。
- **开发日志 / 分析文件**：开发过程日志、调试/分析中间产物（**不含**项目级 `MEMORY.md`、每日工作日志 `YYYY-MM-DD.md` 等记忆文件）。
- **实施契约 / 进度 / 能力 / 计划 / 工作流分析**：阶段性契约、进度跟踪、能力/计划/工作流分析稿。
- **审计报告 / 代码审查报告**：一次性审计、代码审查产出（非须长期留存的结论性文件）。
- **临时测试文件 / 测试脚本**：临时验证用的测试文件与脚本（**明确排除冒烟测试文件**——冒烟测试属须保留的可运行验证，不得删）。
- **截图**：过程性截图（非交付物必需的配图）。
- **构建产物**：编译/打包/构建输出（如 `dist/`、`build/`、`out/`、产物压缩包）。

### 22.2 清理工区工作流（强门禁：先搜列、后确认、再删除）

1. **搜索并详细列出（只读）**：按 `### 22.1 可删除文件定义（清理工区时的目标集）` 定义，在你指定的工区（默认当前工作目录）搜索全部可删除文件，**逐项列出完整路径 + 大小 + 修改时间 + 类型归属**，生成明细清单呈现给你；此步不删除任何文件。
2. **暂停等你确认**：列出后**一律暂停**，绝不自动删除；须你明确确认（整体确认或逐项勾选）后，才进入删除。
3. **确认后删除执行**：

- 含中文/非 ASCII 路径一律用 `Remove-Item -LiteralPath`（PowerShell），**禁** Git Bash `rm -rf` 父目录（防路径截断误删）。
- 优先移入回收站/废纸篓而非永久删；确需永久删时单路径、小批量（≤10）逐批并逐批核验。
- **绝不触碰受保护清单（ `### 22.3 必须保留与受保护清单（清理工区永不删）`）**：`.git/`、源码目录（`src/` 等）、配置/依赖、`README.md`/`LICENSE`/`CHANGELOG.md`、`.github/`（CI）、`.workbuddy/`（项目记忆库，禁止删除）、冒烟测试文件。

1. **范围边界**：本流程仅覆盖"清理工区"语义下的**文件**清理；远程仓库 / CI / 发版动作不在此流程内。

### 22.3 必须保留与受保护清单（清理工区永不删）

> 本清单是"可删除"定义的**反向硬例外**：凡落入下述任一类，一律**不得**纳入删除、不出现在搜列清单中，与"绝不触碰"同源。

- **必须保留（代码 / README / GitHub 必需）**：
- 代码目录：`src/`、`public/`、`desktop/`、`scripts/`、`tests/`
- 配置 / 依赖：`package.json`、`package-lock.json`、`vite.config.js`、`.gitignore`
- GitHub 必需：`.github/`（CI 工作流）、`LICENSE`、`README.md`
- 明确保留：`CHANGELOG.md`（标准仓库版本记录，**非**"阶段性报告"，不按 `### 22.1 可删除文件定义（清理工区时的目标集）` 处理）
- **受保护（禁止清理）**：
- `.git/`：版本库本体，删则丢失全部提交历史，永不碰
- `.workbuddy/`：项目记忆库（含 `MEMORY.md` 与 `memory/` 日志），禁止删除
- **边界澄清（避免歧义）**：`tests/`、`scripts/`、`desktop/` 作为仓库**常驻代码目录**整体保留；其中**临时验证用**的测试文件 / 脚本仍按 `### 22.1 可删除文件定义（清理工区时的目标集）` 判定为可删除（排除冒烟测试），即"目录保留、目录内临时文件可删"。`CHANGELOG.md` 与  `### 22.1 可删除文件定义（清理工区时的目标集）` 「阶段性报告」互斥，前者永远保留。

---

# 第六篇：技能与常驻提醒

> 本篇为跨项目复用的常驻技能与提醒事项，涉及对应场景时主动加载。

## 第23章 常用跨项目技能（常驻工具链，跨项目）

> 经多会话实证、跨项目复用的常驻技能；与 git/gh 流程互补（路径核验另见 `## 第10章 路径核验`），涉及对应场景时主动加载。
>
> 安装任何新 skill 前必须先做安全审计：P0 强警告并暂停、P1 需二次确认、P2 可直接装。

| 技能 | 用途 | 触发场景 |
| ------ | ------ | ------ |
| deep-discuss（结构化深度讨论） | 多轮问题分析、方案设计、决策推演 | 用户描述问题并期望结构化分析时优先加载 |
| code-review-combo（联合代码审查） | 两种互补子技能（委托模式确定性审查 + 五焦点语义深度审查）交叉验证，产出唯一合并审计报告 | 代码审查 / 审计 / 查 BUG 场景。审查与执行两阶段严格分离：审查阶段显式声明"只读、不修改"，修复另起一步；审查脚本一律经 uv run 调用（禁用裸 python / pip），不裸跑 python |
| github-personal-manager（GitHub 管理统一执行） | 提交 / 推送 / 开 PR / 同步 / 发版 / 分支清理等本地与远端 GitHub 操作的一站式技能 | 凡涉及 GitHub 仓库/项目/代码操作，必须先按名称激活此技能（详见 `## 第13章 工作流一 github-personal-manager 自动激活（GitHub 工作流总闸门，前置）`） |

> ⚠️ **清单维护约定**：本表须与本机实际已安装技能保持一致。**已卸载**的旧技能（`review-spd`、`open-code-review-delegate`）其职能已由 `code-review-combo` 统一承接，不再单列；今后新增/卸载技能时同步更新本表与速查索引，避免记忆指向不存在的技能。

---
