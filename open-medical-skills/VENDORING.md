# Vendoring 约定（open-medical-skills）

本文件说明本技能「父编排 + 子 vendored 副本」的同步纪律，对齐 web-search 的
VENDORING.md，确保陌生 Agent 与本仓库协作者对更新流程有一致认知。

## 一、什么是 vendored 副本

四个原生子技能（`clinical-differential-diagnosis`、`lab-result-interpreter`、
`clinical-treatment-plan-generator`、`drug-interaction-checker`）以「与上游
Open-Medica/open-medical-skills 逐字一致、零本地补丁」的副本形式，**提交进本仓库**
（位于本包顶层同名子目录，如
`open-medical-skills/clinical-differential-diagnosis/SKILL.md`）。

这样做的目的：

- 离线确定性：部署时无需联网克隆上游，复制即可用。
- 仓库纪律一致：与 web-search、code-review-combo 的既有目录型 Skill 同构。
- 父本地化解耦：父 `SKILL.md` 做中文适配与默沙东注入，子副本保持纯上游。

## 二、硬规则

1. 零补丁：vendored 副本内不得有任何本地化改动；任何修改都应发生在父 `SKILL.md`。
2. 无嵌套 .git：vendored 子目录严禁 `git clone` / `submodule`（会生成嵌套 .git，
   污染本仓库）。上游源仅存于 `upstream/`（已被 .gitignore 排除，不入版）。
3. 单一事实源：子技能清单与上游地址以 `config.json` 的 `native_skills` 与
   `upstream.*` 为准，同步脚本不得双份硬编码。
4. 版本标记：每次同步后，各子目录写 `.upstream_version`（记录 commit 与时间戳）。

## 三、同步脚本

`scripts/sync_openmedical.py`（标准库 + subprocess，best-effort）：

- 确保 `upstream/` 缓存最新（存在则 `git fetch` + `reset --hard`；缺失则
  `git clone --depth 1`）。
- 从 `upstream/skills/<name>/SKILL.md` 文件级复制四子技能到顶层 vendored 目录。
- 写回 `.upstream_version`。
- 支持 `--dry-run` 预览、`--check-drift` 仅做漂移检测。

## 四、漂移检测

`python scripts/sync_openmedical.py --check-drift`：逐文件比对本地 vendored 副本与
`upstream/` 缓存的 sha256；不一致即提示运行同步脚本。无网络/上游缺失时视为「未知」，
不误判。

## 五、跟进上游流程（Agent 自主执行）

当用户显式指令「更新上游 / 跟进 Open-Medica 演进 / 同步子技能」时，Agent 读取
`README.md` 的「跟进上游演进」章节，执行：

    python scripts/sync_openmedical.py

完成后按需运行 `--check-drift` 验证。随后将变动提交进本仓库（遵循 AGENTS.md 纪律）。
