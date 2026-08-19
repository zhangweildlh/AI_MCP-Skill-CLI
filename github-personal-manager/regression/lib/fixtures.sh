#!/usr/bin/env bash
# =============================================================================
# 文件名: gpm-regression/lib/fixtures.sh
# 中文名: 本地三层仓库夹具（上游仓库 → 远端仓库(fork) → 本地仓库）
#
# 【拓扑】
#   upstream.git (裸仓, 模拟上游仓库 upstreamorg/gpm-upstreamrepo)
#        ↑ (fork 关系)
#   origin.git   (裸仓, 模拟你的 fork 远端 zhangweildlh/gpm-forkrepo)
#        ↑ (clone/push)
#   local        (工作克隆, 含 origin + upstream 两个远端)
#
# 【关键技巧 · insteadOf 精确重写】
#   本地克隆把 origin/upstream 的 remote URL 设为 github.com 形式（供 _sop_parse_owner_repo
#   解析出正确 owner/repo），同时用 `url.<本地裸仓直接路径>.insteadOf <github URL>` 把实际
#   fetch/push 透明重写为本地裸仓路径，从而实现完全离线、且拓扑语义与真实 GitHub 一致。
#
# 【重要环境约束（实测结论）】
#   本机 D: 盘上 `git clone` 任意本地仓库均失败（统一报
#   "fatal: failed to iterate over '<path>/objects/'"，git 本地克隆的硬链接/对象目录
#   复制传输被 D: 卷拦截），但 `git init` / `git push` / `git fetch` 到本地仓库均正常。
#   因此三层夹具**不使用 clone**，改用 `git init` + `git push` + `git fetch` 构建；
#   insteadOf 重写为「直接本地路径」（已实测直接路径 fetch/push 在 D: 盘可用；
#   而 file:// 形态在本机静默失效，故不用）。
#
#   导出变量（每次 setup 后刷新）：TRIPLE_UP / TRIPLE_OR / TRIPLE_LOCAL
# =============================================================================

# 构建三层夹具；成功回显 "up|or|local" 三段路径（用 | 分隔）
setup_triple() {
  local name="${1:-demo}"
  local base="$TEST_TMP/triple_$(date +%s%N)_$RANDOM"
  mkdir -p "$base"
  local upstream="$base/upstream.git"
  local origin="$base/origin.git"
  local local="$base/local"

  # 1) upstream / origin 裸仓（git init --bare 在 D: 盘可用）
  "$REAL_GIT" init -q -b main --bare "$upstream"
  "$REAL_GIT" init -q -b main --bare "$origin"

  # 2) local 工作仓 + 初始提交（不用 clone）
  "$REAL_GIT" init -q -b main "$local"
  ( cd "$local" \
    && "$REAL_GIT" config user.email r@e.com \
    && "$REAL_GIT" config user.name r \
    && echo "init" > init.txt \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "init" )

  # 3) push local -> upstream / origin（push 在 D: 盘可用，替代 clone）
  "$REAL_GIT" -C "$local" push -q "$upstream" main
  "$REAL_GIT" -C "$local" push -q "$origin" main

  # 4) 配置 local 的远端 URL(github 形式, 供解析) + insteadOf 重写为本地裸仓直接路径
  #    注：第 3 步是向裸仓直接 push（非经 remote 名），origin/main 远程跟踪引用尚未建立，
  #    故先 fetch 填充远程跟踪引用，再设本地 main 跟踪 origin/main。
  ( cd "$local" \
    && "$REAL_GIT" remote add origin "https://github.com/zhangweildlh/gpm-forkrepo.git" \
    && "$REAL_GIT" remote add upstream "https://github.com/upstreamorg/gpm-upstreamrepo.git" \
    && "$REAL_GIT" config "url.$origin.insteadOf" "https://github.com/zhangweildlh/gpm-forkrepo.git" \
    && "$REAL_GIT" config "url.$upstream.insteadOf" "https://github.com/upstreamorg/gpm-upstreamrepo.git" \
    && "$REAL_GIT" fetch -q origin \
    && "$REAL_GIT" fetch -q upstream \
    && "$REAL_GIT" branch -u "origin/main" main >/dev/null 2>&1 )

  TRIPLE_UP="$upstream"; TRIPLE_OR="$origin"; TRIPLE_LOCAL="$local"
  echo "$TRIPLE_UP|$TRIPLE_OR|$TRIPLE_LOCAL"
}

# 在本地克隆上开一个 feat 分支、提交并推到 origin（fork 内部 PR 的典型前置）
make_feat_and_push() {
  local local="$1"; local topic="${2:-featX}"
  ( cd "$local" \
    && "$REAL_GIT" checkout -q -b "feat/$topic" \
    && echo "change" > "feat_$topic.txt" \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "feat: $topic" \
    && "$REAL_GIT" push -q -u origin "feat/$topic" )
}

# 让 local 的 main 领先 upstream/main（供 sync 类脚本制造“领先”场景）
make_local_ahead() {
  local local="$1"
  ( cd "$local" \
    && "$REAL_GIT" checkout -q main \
    && echo "local change" > local.txt \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "local ahead" \
    && "$REAL_GIT" push -q -u origin main )
}

# 让 upstream 领先（供 sync 类脚本制造“落后”场景）
# 用临时工作仓向 upstream 推送新提交（push 在 D: 盘可用），再让 local fetch 刷新引用。
make_upstream_ahead() {
  local upstream="$1"; local local="$2"
  local tw="$TEST_TMP/up_$(date +%s%N)_$RANDOM"; mkdir -p "$tw"
  "$REAL_GIT" init -q -b main "$tw"
  ( cd "$tw" \
    && "$REAL_GIT" config user.email r@e.com \
    && "$REAL_GIT" config user.name r \
    && "$REAL_GIT" remote add upstream "$upstream" \
    && "$REAL_GIT" fetch -q upstream \
    && "$REAL_GIT" checkout -q -b main "upstream/main" \
    && echo "up change" > up.txt \
    && "$REAL_GIT" add -A \
    && "$REAL_GIT" -c user.email=r@e.com -c user.name=r commit -qm "upstream ahead" \
    && "$REAL_GIT" push -q upstream main )
  rm -rf "$tw"
  # local 刷新远端引用（fetch 在 D: 盘可用）
  ( cd "$local" && "$REAL_GIT" fetch -q upstream )
}
