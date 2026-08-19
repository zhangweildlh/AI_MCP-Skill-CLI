#!/bin/sh
# install-hooks.sh —— 安装仓库级 git 钩子（.githooks/ 目录）。
#
# 用法：在仓库根运行  bash scripts/install-hooks.sh
# 适用：Windows Git Bash 下运行（也兼容 macOS / Linux 的 POSIX sh）。
# 幂等：可重复执行，重复运行只重新确认配置，不产生副作用。
#
# 效果：设置 `git config core.hooksPath .githooks`，
#       使 git 从 .githooks/ 目录读取钩子（无需拷贝、无需 chmod +x）。

set -e

# 定位仓库根：本脚本位于 <repo>/scripts/install-hooks.sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd -P)

cd "$REPO_ROOT"

# 设置 hooksPath（幂等：值一致时 git config 直接覆盖为相同值，不影响其它配置）
git config core.hooksPath .githooks

echo "✅ 已设置 git config core.hooksPath = .githooks"
echo "   当前生效 hooks 路径：$(git config --get core.hooksPath)"
echo "   已安装钩子：$(ls .githooks 2>/dev/null | tr '\n' ' ' || echo '（.githooks 目录为空）')"
echo ""
echo "提示：此命令可重复执行；如需临时停用钩子，可运行 git config --unset core.hooksPath。"
