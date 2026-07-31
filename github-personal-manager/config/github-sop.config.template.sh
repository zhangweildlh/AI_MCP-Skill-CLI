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
REPO_ROOT="D:/Documents/AI_Work_Temp"   # 本地 GitHub 仓库根目录默认值（允许的硬编码默认值）；用户绝对路径优先
GH_USER="zhangweildlh"                  # GitHub 用户名默认值（允许的硬编码默认值）；实际值由 origin 远端拥有者覆盖
GH_EMAIL=""           # 提交用邮箱，如 <email>；留空则用 git 全局配置
TEST_REPO_DIR=""      # 冒烟夹具仓库根（运行期生成，可留空用默认 tmp）
