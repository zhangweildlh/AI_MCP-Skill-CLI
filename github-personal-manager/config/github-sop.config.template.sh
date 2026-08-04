#!/usr/bin/env bash
# =============================================================================
# 文件名: config/github-sop.config.template.sh
# 中文名: 本机运行配置·模板文件（入版本库，供复制）
#
# 【功能】
#   github-personal-manager 技能的配置模板。本文件只声明变量与默认值，不含可执行逻辑，
#   作用是给出一份「字段齐全、可安全入库」的样板，供使用者复制成本机实例配置。
#
# 【用途 / 使用场景】
#   1. 首次部署本技能：复制本文件为同目录下的 github-sop.config.sh，再按本机情况填值。
#   2. 换机器 / 新同事上手：以本模板为准核对字段是否缺漏。
#   3. 技能升级新增配置项时：先在本模板登记，再同步到各自的本机实例文件。
#
# 【详细用法】
#   复制命令示例:
#     cp config/github-sop.config.template.sh config/github-sop.config.sh
#   随后编辑 github-sop.config.sh 填入本机值即可，本模板本身无需修改。
#   各字段的完整含义见下方逐行注释，以及 github-sop.config.sh 头部的字段说明。
#
# 【注意事项】
#   - 所有字段均可留空；留空时脚本与冒烟测试会回退到 PATH 上的 git / gh。
#   - 本模板会进入版本库，务必不要在此填写任何本机私有路径、账号或邮箱等敏感信息。
#   - 真正生效的是复制后的 github-sop.config.sh，该文件已被 .gitignore 忽略、不入库。
# =============================================================================

GIT_BIN=""            # git 路径不硬编码：留空则由脚本经 where.exe git 解析实际路径（可选覆盖）
GH_BIN=""             # gh 路径不硬编码：留空则由脚本经 where.exe gh 解析实际路径（可选覆盖）
MAIN_BRANCH="main"    # 主分支名
ORIGIN_REMOTE="origin"
UPSTREAM_REMOTE="upstream"
UPSTREAM_REPO=""      # 上游仓库 owner/name，如 <upstream>
REPO_ROOT="D:/Documents/AI_Work_Temp"   # 本地 GitHub 仓库根目录默认值（允许的硬编码默认值）；用户绝对路径优先
GH_USER=""                  # GitHub 用户名默认值（允许的硬编码默认值）；实际值由 origin 远端拥有者覆盖
GH_EMAIL=""           # 提交用邮箱，如 <email>；留空则用 git 全局配置
TEST_REPO_DIR=""      # 冒烟夹具仓库根（运行期生成，可留空用默认 tmp）
