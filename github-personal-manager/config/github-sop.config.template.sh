#!/usr/bin/env bash
# github-personal-manager 配置模板
# 复制本文件为 github-sop.config.sh 并填入本机值（github-sop.config.sh 已被 .gitignore 忽略，不入库）。
# 所有字段均可留空；留空时脚本/测试将回退到 PATH 上的 git/gh。

GIT_BIN=""            # git 可执行文件绝对路径，如 D:/Tools/Assembly/git/cmd/git.exe
GH_BIN=""             # gh 可执行文件绝对路径，如 D:/Tools/Assembly/gh.exe
MAIN_BRANCH="main"    # 主分支名
ORIGIN_REMOTE="origin"
UPSTREAM_REMOTE="upstream"
UPSTREAM_REPO=""      # 上游仓库 owner/name，如 gitextensions/gitextensions
GH_USER=""            # GitHub 登录名，如 zhangweildlh
TEST_REPO_DIR=""      # 冒烟夹具仓库根（运行期生成，可留空用默认 tmp）
