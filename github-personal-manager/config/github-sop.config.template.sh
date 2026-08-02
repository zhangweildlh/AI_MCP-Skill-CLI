#!/usr/bin/env bash
# github-personal-manager 配置模板
# 复制本文件为 github-sop.config.sh 并填入本机值（github-sop.config.sh 已被 .gitignore 忽略，不入库）。
# 所有字段均可留空；留空时脚本/测试将回退到 PATH 上的 git/gh。

GIT_BIN=""            # git 路径不硬编码：留空则由脚本经 where.exe git 解析实际路径（可选覆盖）
GH_BIN=""             # gh 路径不硬编码：留空则由脚本经 where.exe gh 解析实际路径（可选覆盖）
MAIN_BRANCH="main"    # 主分支名
ORIGIN_REMOTE="origin"
UPSTREAM_REMOTE="upstream"
UPSTREAM_REPO=""      # 上游仓库 owner/name，如 <upstream>
REPO_ROOT=""   # 本地 GitHub 仓库根目录默认值；留空则由用户传入的绝对路径仓库目录或当前目录决定，用户绝对路径优先（见 SKILL.md 仓库解析规则）
GH_USER=""     # GitHub 用户名默认值；留空则脚本自动从 origin 远端拥有者解析，仍无则报错退出（绝不写死具体账号以保持跨账号可移植）
GH_EMAIL=""           # 提交用邮箱，如 <email>；留空则用 git 全局配置
TEST_REPO_DIR=""      # 冒烟夹具仓库根（运行期生成，可留空用默认 tmp）
