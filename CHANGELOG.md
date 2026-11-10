---

## [2026-11-10]

### Added
- **dir/Workbuddy专属：wechat-article-to-ima 落地四套引导词（引导词.md）+ SKILL.md 调用示例，修 reset-card 措辞，补 G4 回归（PR #201，`83ccdba`）**：新增 `引导词.md`——沉淀修正后四套引导词（引导词 A/B/C 各自针对卡片 A/B/C 全量采集，平行关系、进度按卡隔离互不污染；续跑守护针对 A/B/C 断点续跑，以 `diff-keywords` 取差集 + `--ingest-quarantine` 消费本卡隔离区，检测信号 = `status` ∪ `diff-keywords` 差集 ∪ 隔离区残差，修正仅看 `status` 的漏判）。`SKILL.md` 新增「调用示例」章节（引导词 A + 续跑守护全文）；修正 `reset-card` 措辞（重跑前重置；续跑请用 `diff-keywords`、勿调 `reset-card`）。`tests/test_pipeline_contract.js` 新增 ⑩ 隔离区残差消费不依赖 `status`（G4 回归，搜索完成但入库失败残留仍须被续跑守护消费）。验证：`test_state.js` 76/0、`test_pipeline_contract.js` 57/0（新增 4 项）；pre-commit 门禁（Tier0 密钥/忽略、Tier1 结构冒烟、scope 校验 dir/Workbuddy专属）全过；部署态经 `scripts/deploy.js` 从 main blob 逐字节重建 16/16 一致（含新 `引导词.md`），保留 `ima_credentials.json`。

---

## [2026-11-09]

### Fixed
- **dir/Workbuddy专属：wechat-article-to-ima 断点续跑根治——partial 状态机 + searchedKeywords 定向续搜 + 隔离区补入（PR #197，`e7bae01`）**：修复续跑守护漏卡根因——旧实现 `pendingKeywords` 写而不读、`searchedKeywords`/`partial` 字段本不存在，导致重跑时无法判定「哪些词已搜、哪些卡需补入」。`scripts/state.js` 卡结构新增 `searchedKeywords`（累积去重集合）与 `failureClass`（`transient`/`permanent`），新增 `update-card --searched-keywords/--clear-searched/--failure-class`、`diff-keywords`（输出未搜词差集）、`classify-failure`（瞬时限流/网络 vs 永久凭据失效分类）；`validate` 向后兼容旧卡缺新字段。`scripts/pipeline.js` 新增 `--ingest-quarantine` 消费 `failed_quarantine/` 下未入库 `.md` 直接补入库（`shouldReingest` 纯函数跳过闸门未过篇目、KB 去重、复验 `media_type===11`），且检索前若 `pendingKeywords`/未搜词非空则只搜剩余词（避免重触发限流）。`SKILL.md` 新增「断点续跑与续跑守护」专章（触发场景一~四、可机读信号、五步续跑法、`permanent` 失败交人工且守护停止续跑）。测试扩展 `test_state.js`（73/0）+ `test_pipeline_contract.js`（44/0），全仓 5 套离线测试（test_state 73 / test_pipeline_contract 44 / test_filter_rules 47 / test_fetch_failure_taxonomy 12 / test_kb_consistency 10）全 0 失败。验证：CI 全量门禁（meta 分类触发 tier0-3,5,6）pass；部署态由 main blob 逐字节重建 15/15 一致、0 CR；保留 `ima_credentials.json`。
- **dir/Workbuddy专属：wechat-article-to-ima 修复 reset-card 累积态未清 + 隔离区跨卡污染 + 隔离区补入静默失效（PR #199，`3bd9d04`）**：方案 B 续跑守护上线后审计复现三处缺陷。① 缺陷 B（reset-card 累积态未清）：`reset-card` 原仅 `filter` 文章记录，未清卡级 `searchedKeywords`/`failureClass` → 强制全量重搜失效、旧 `permanent` 失败类沿用阻断重试；现清空本卡两字段且仅清本卡。② 缺陷 C（隔离区跨卡污染）：`--ingest-quarantine` 读共享 `failed_quarantine/` 时，对「本卡进度无记录」的文件仍 `shouldReingest(title,undefined)`（恒 true）→ 误将他卡残留 `.md` 入库本卡、同标题误食对方内容；现加双重闸（文件名卡前缀 `safeFile(card)+'__'` 非本卡跳过 + 无本卡进度记录跳过），写入侧文件名加卡前缀消除同标题跨卡碰撞。③ 连带缺陷（隔离区补入静默失效，测试中暴露）：`mark-ingested` 原无条件拒绝 `failed`/`filtered`→`ingested`，而隔离区补入恰是对 `failed` 文章重入 → 文件被删、进度仍 `failed`、功能形同虚设；现改为「未联机复核时拒绝，复核通过（KB 确存 `media_type===11`）则允许翻正」。测试扩展 `test_state.js` ⑥ 段（断言 reset-card 清本卡累积态且不影响他卡）+ `test_pipeline_contract.js` ⑨ 段（双模桩覆盖跨卡负向 + 同卡正向），全仓 5 套离线测试（test_state 76 / test_pipeline_contract 53 / test_filter_rules 40 / test_fetch_failure_taxonomy 12 / test_kb_consistency 10）全 0 失败；`run_all.py --scope dir/Workbuddy专属 --project-tests` PASS=7。验证：CI smoke/scope-map pass、mergeable；部署态由 main blob 逐字节重建（4 文件 hash 全 == blob）。

---

## [2026-11-05]

### Added
- **dir/Workbuddy专属：wechat-article-to-ima 补开发态→部署态同步脚本 `scripts/deploy.js`（PR #191，`831b9b7`）**：此前该技能无部署同步脚本，部署只能靠一次性临时脚本完成、不可复现，且易绕过 §7.3「部署态一律由 main blob 逐字节重建（不经工作树）」硬规则。新脚本零依赖（Node 内置模块），走 `git cat-file blob` 逐字节重建、含写后逐文件字节校验；`ima_credentials.json` 为部署态专有物（凭据明文，§3.3）显式保留不覆盖；支持 `--repo/--skill-path/--ref/--to/--dry-run`。SKILL.md「技能脚本清单」补对应条目。部署态实测 7/7 与 main blob 逐字节一致。
- **dir/Workbuddy专属：两技能测试资产迁移与补齐（PR #194，`22bf1cb`）**：把任务卡 A 执行期散落在工区的一次性诊断脚本按 §8.3⑤「可复用测试脚本允许入库」甄别后，改造并剪切/移动入仓库，形成 **7 套 / 217 断言** 的测试资产，覆盖冒烟·回归·真实态三类。
  - **搬入**：`test_kb_consistency.js`（ima 库五维一致性审计：重复条目/front-matter 污染/服务端截断/非笔记媒体类型/幽灵记录/孤儿条目）、`test_fetch_failure_taxonomy.js`（抓取失败五类归因分类器 + `url_resolved` 交叉表）、`test_state.js`（state.js 全子命令 + 强约束 + `dedupKey` 截断语义，**该脚本此前零测试**）、`test_pipeline_contract.js`（响应解析层/过滤分层/闸门判据/元数据头形态/CLI 契约）、`test_cli_contract.js`（检索技能**命令行契约层**，此前仅测内部函数）。
  - **不搬**：`_migrate.js`/`_process.js`/`_resolve.js`（已分别下沉为 `state.js migrate`/`pipeline.js`/`resolve_midlink.js`，重复）；`_write_memory.js`/`_search_a.sh`/`*.log`/`*_summary.json`（§8.3④⑤ 过程与衍生文件）。
  - **改造要点**：去本机绝对路径（改 `__dirname` 相对定位 + 环境变量覆盖）、样本固化为技能内 `tests/fixtures/`（大体积样本用运行时确定性补白组合，不留大 blob）、真实态用例默认跳过须 `--allow-real` 门控（§9.3）、临时文件自清理（§9.5）、PASS/FAIL 计数 + 非零退出码。
  - **顺带修掉两个自身缺陷**：① `pipeline.js` 的 `--dry-run` 守卫位于 `mark-filtered`/`mark-ingested` 之后 →「预演」会污染进度文件，已前移并加断言；② 响应解析层不可单测 → 抽出纯函数 `parseImaResponse()` 并导出（解析缺失曾致去重失效、重复入库不可逆）。
  - **验证**：离线 217 断言全通过；经唯一入口 `run_all.py --scope dir/Workbuddy专属 --project-tests` 调度 **PASS=7 FAIL=0 SKIP=0**；部署态 7 套回归全通过，§7.3 三项判据 14/14 与 12/12 全过。

### Fixed
- **dir/Workbuddy专属：wechat-article-to-ima / wechat-article-search 下沉 11 项采集链路缺陷修复（PR #190，`ef32020`）**：来源为 2026-11-05 任务卡 A（总包/EPC）全链路执行 + 三技能联合复测坐实，**11 项可下沉项全部落地**。
  - **S1 中转链接未解析致 91% 抓取失败**：搜狗 `url_resolved=false` 条目的 `&` 被写作 HTML 实体 `&amp;`，URL 畸形 → 直连被重定向到 `weixin.sogou.com/antispider/`，实测 23 篇抓取失败中 21 篇因此失败。修复：① `search_wechat.js` 在 href 提取与 `getRealUrl` 内解码 URL 实体（实测含未解码实体 4/4 → 0/4）；② 新增 `scripts/resolve_midlink.js`（降级链零级，走 Chrome DevTools HTTP 端点 `/json/new`+`/json/list`+`/json/close`，**不依赖 MCP、不依赖 WebSocket**，实测 18/24 条中转链接解析为真实直链）。
  - **S2 笔记去重用整标题精确比对，但服务端截断标题至 30 字符**：实测 28 条中 11 条被截断 → 续跑必然重复入库，而**开放接口无 delete/remove 端点、重复不可逆**。修复：去重键改「归一化标题前 30 字符」，且**先剥末尾 `...` 再切片**（标题恰为 30 字时截断标记落在切片内仍会失配——实测命中 20→22、缺失 6→4）；实测 KB 17 条原始 → 14 唯一。
  - **S3 过滤规则为无边界子串匹配，误杀 93%**：实测 29 篇被过滤中 27 篇误杀（「大力推广」「评标办法和标准」「招标人与中标人的责任」等政策套话/法规原文），且「动工」⊂「推动」、「开工」⊂「召开」。修复：词族分层（强特征/弱特征 + 上下文模式 + 词边界守卫），正文层仅强特征且须同族命中 ≥2；回归断言 29 条历史误杀样本全部不再拦截 + 3 条真命中仍拦截 + 11 条子串边界用例（43/43 通过）。
  - **S5 `state.js` 缺三个子命令致 F9 与 SKILL.md 自相矛盾**：`report` 的「被过滤」列因无写入入口恒为 0；步骤 12 的卡级字段无法经唯一入口写入；旧 `failed` 记录永久阻断重跑。修复：新增 `mark-filtered` / `update-card` / `reset-card`。
  - **S6 `_progress.json` 历史 schema 与 `state.js` 不兼容**（旧 `status/ingested/gatePassed` vs 新 `fetchStatus/filterResult/gateResult/ingestStatus`，`validate` 直接判非法）。修复：新增 `migrate` 幂等迁移，卡级字段零改动；SKILL.md 补 articles 条目完整 schema。
  - **S7 `mark-ingested` 默认不联机复核**，历史进度出现「声称已入库而 KB 全库查无此文」的幽灵记录。修复：默认复核 `media_type===11`，`--no-verify` 显式关闭。
  - **S4 抓取降级链三级降级全无代码实现**：新增 `scripts/pipeline.js` 固化「抓取→过滤→闸门→入库→状态回写」全流水线（ima 调用经 `ima_api.cjs` 模块导出，规避长正文 CLI 参数长度上限）。
  - **S8 元数据头用 YAML front-matter 致标题污染**：服务端把正文首个元数据行当标题，实测历史条目 5/11 出现 `title: "…`。修复：元数据头锁定内联形态、禁 front-matter、`title` 显式传参；并记入「`import_doc` 不接受 `folder_id`（code=310001）」陷阱。
  - **S9 调试端口「配置有、实际没在跑」且运行中消失**：前置检查改为实测连通 + 自愈拉起（`resolve_midlink.js --check`）。
  - **S10 F4 熔断语义过宽致丢弃已取回数据**：拆为 F4a（停检索、保留已取回数据并继续处理）/ F4b（零有效结果才整体终止）——实测原语义会使产出归零，按 F4a 后同批数据产出 14 篇。
  - **S11 `cardId` / `card` 字段名不统一**：读取兼容、写入归一。
  - **S12 版本戳同步**：to-ima 1.2.3 → 1.3.0、search 0.1.5 → 0.1.6。
  - 另：`恢复指南-ima-skills上游更新重放修复.md` 新增 P-ima-NOTE-FOLDER（import_doc 契约项）+ D13 文档修复项 + §0.4 覆盖检测 grep；部署态 `ima-skills` 的 `notes/SKILL.md` 与 `knowledge-base/SKILL.md` 同步沉淀该组契约事实。
  - **验证**：过滤规则回归 43/43；search 自带测试 47 → 54 全通过；state.js 全子命令实测（migrate 幂等且卡级字段零丢失、mark-filtered 使 report 被过滤列可产出、mark-ingested 默认复核缺参即拒、filtered→ingested 被强约束拦截、reset-card 生效）；pipeline 实测（KB 去重键 17→14、去重命中零新增条目、真实入库 3 篇并复验 `media_type===11`、闸门未过件正确隔离）；仓库 smoke tier0/1 31 OK/0 FATAL/0 WARN。部署态 §7.3 三项判据全过（7/7 与 11/11）。
  - **未修项（量化披露）**：ima 开放接口无 delete 端点 → Card A 历史 3 条重复副本不可逆；Card C 历史 5 条 front-matter 污染标题无删除/改名端点，不可自动修复。

### Changed
- **meta（`scripts/smoke/test_manifest.py` 扫描口径）**：`scan_unregistered()` 原只遍历仓库根下一层目录，导致**嵌套技能目录**（合集目录内的子技能，如 `Workbuddy专属/<子技能>/tests/`）的测试目录完全不被扫描 —— 「新增测试未登记」无法被发现（§9.4 扫描优先 / §9.7 清单与 CI 协同）。现改为按「含 `SKILL.md` 的目录即技能根」逐层发现，覆盖嵌套技能；已做负向验证：临时移除某条登记后扫描即报出该未登记目录。
- **dir/Workbuddy专属：wechat-article-search F1 端口自动探测兜底 + F2 残缺/空 Cookie 文案澄清（PR #186，`af1cfc3`）**：F1 消除「默认 9223」误导——`get_sogou_cookie.js` 改候选端口探测数组（9222~9240，按 UA 过滤跳过 WorkBuddy/Electron 自身）+ 读 `SOGOU_CDP_PORT`，未命中再报全候选不可达；错误提示改为「本机实测常为 9222 而非默认 9223」。F2 冷 profile 无 Cookie 退出码 2 文案点明「当前调试浏览器 profile 尚未访问过 weixin.sogou.com」。SKILL.md 去 9223 硬编码、补退出码 3 语义与回退段 `SOGOU_CDP_PORT` 说明。CI smoke/scope-map pass；部署态经 `scripts/deploy.js` 从 main blob 逐字节同步一致。
- **dir/Workbuddy专属：wechat-article-to-ima 问题3上升前置契约 + F4 即停试/会话级熔断 + F5 两段式 + F8 笔记去重 + F9 state.js + F12/F13/F14 文档修正（PR #187，`f052de7`）**：① 问题3上升前置契约（chrome-devtools 调试浏览器就绪 + `SOGOU_CDP_PORT` 契约，与 wechat-article-search 呼应）；② F4 退出码 1+ANTI_SPIDER 仅记 1 次尝试不累加 attempts + 会话级反爬熔断（连续 ≥2 关键词命中即整体终止）；③ F5 提取与检索两段式范式（严禁 `&&` 串联）；④ F8 笔记类（media_type=11）去重改 `get_knowledge_list` 按 title 比对；⑤ F9 新增零依赖 `scripts/state.js` 作 `_progress.json` 唯一读写入口（强约束：failed 严禁标 ingested、mark-ingested 须复核 media_type===11）；⑥ F12 口径调和、F13 软告警（句号数不足但满足辅助判据不自动拒）、F14 凭据优先级（环境变量→`~/.config/ima/`→技能目录兜底）、F10 陷阱段改写（ima_api.cjs 现已校验 HTTP 状态码）。CI smoke pass；部署态由 main blob 逐字节重建（SKILL.md + scripts/state.js），保留 `ima_credentials.json`。
- **dir/Workbuddy专属：恢复指南追加 ima-skills F6 参数契约 + F10 HTTP 状态码重放项（PR #188，`878fb3c`）**：① F6（`ima_api.cjs` 位置参数无 `--help`/无格式校验）→ 补 `--help`/`-h` 用法输出（exit 0）+ `apiPath` 须 `openapi/<module>/v1/<action>` 前缀校验（exit 1 + code -100）；② F10 `postJson` 校验 `res.ok`，非 2xx 抛错（含 `httpStatus`/`body`，`main` catch 透出到 stderr JSON）；§0.4 覆盖检测桩补两项 grep、附录 A 回归补 IA-01b；同步 `wechat-article-to-ima/SKILL.md` 空响应陷阱段改写。部署态 `ima_api.cjs` 已本地 node 功能测试 4/4 通过。

---

## [2026-11-04]

### Fixed
- **dir/chrome-devtools：修复「连不上 9223（ECONNREFUSED）」与「全新 --user-data-dir 丢登录态」两坐实问题（PR #176，`bb14d36`/`e50d7bb`）**：① 端口硬编码→自动探测（扫 9222~9240，跳过 WorkBuddy/Electron 自身 UA，兼容 Chrome/360Chromex/Edge/Brave）；② 新增 `prepareTempProfile` 把真实 User Data 全量拷贝到临时副本启动（继承登录态、隔离不污染真实 profile、避单实例锁；遇独占锁文件跳过继续，改手动递归拷贝替代 `fs.cpSync` 防 EBUSY）。登录态边界诚实标注（运行中浏览器独占 Cookies → 临时 profile 仅部分继承，推荐复用已开放端口）。CI smoke/scope-map/smoke-scoped 全 pass；单测 14→25；本地门禁 12 OK/0 FATAL/0 WARN。
- **dir/github-personal-manager：修复 `sop_worktree_cleanup.sh` squash 合并陷阱——squash 合并且内容已在主线时原仅依赖祖先判据恒假、误拒回收（PR #179，`63a15a1`）**：新增 squash 双代理（① `gh pr list --head <b> --state merged` 存在已合并 PR；② `git log --format=%T HEAD | grep -qx` tip 树在主线历史），任一命中即走 `git branch -D`；删后校验改判「TIP 树仍在主线历史」；安全闸门全保留。squash 真实场景实跑坐实（PR #178/#179 回收分支，零提交丢失）。
  - **【后续更正·必读】** PR #179「proxy2 兜底路径已验证可用」在脚本自身 `set -uo pipefail` 下不成立：`git log | grep -qx` 触发 SIGPIPE 假阴性、代理2 实为废码；PR #180 回收即命中假告警，逐字节核验内容零丢失（属误报非事故）。修复见下条（PR #181）。
- **dir/github-personal-manager：修复树判据 SIGPIPE 假阴性（PR #181，`935515a`）**：`git log | grep -qx` 命中即退 → git log 收 SIGPIPE(141) → 删后校验随机误报 exit 1；抽出 `tree_in_main_history()` 改用 `grep -Fx`+stdout 重定向（读尽输入无 SIGPIPE）。实测 Windows Git Bash 管道缓冲 4096B（Linux CI 64KB 不复现）→ 旧判据 10 次 2 次误报、新判据 10/10 确定；新增 2 回归用例（共 17）；本地冒烟 PASS=109/SKIP=2/FAIL=0，CI 三项全 pass；部署态重建 58/58 一致、实跑回收本 PR squash 分支无假告警。

### Changed
- **meta（AGENTS.md §4.2 / CHANGELOG.md）：清理 4 本地 + 6 远端冗余分支（对应已合并 PR #170–#177，#176/#177 为 squash 合并），提交零丢失**；§4.2 增补「全链路授权例外条款」——单条指令显式授予本地+远端清理全链路授权时经一次 `--confirm` 完成，未合并内容校验/开放 PR 告警/受保护分支红线不受影响。
- **meta（AGENTS.md §7.3 / §7.2 / 根 `.gitattributes` / `test_manifest.py`，早前条目，已于本文件最新条目反转）**：副本判等口径由「去 CR 后一致」升级为「字节严格一致」并全量重建部署态 LF；① §7.3 改判据为逐字节==main blob 且两侧 CR=0（旧 CRLF 豁免口径废止）；② §7.2 补登记此前未登记的 11 个 Skill、聚合 md5 统一口径、更正「部署副本共两份」为「NTFS Junction 物理一份」；③ 根 `.gitattributes` 新增 `* text=auto eol=lf`；④ `test_manifest.py` 的 `CLEANUP_DIRS` 补收录 `github-personal-manager/regression/tmp`；⑤ 修正 markdown 表格管道转义；⑥ `.githooks/pre-commit` 两处 meta 白名单补 `.gitattributes`。（**本轮末已反转回 CRLF 豁免 + 强制 LF，见下方最新条目**）
- **meta（AGENTS.md §7.3 反转 + §7.2 精简 + 纪律瘦身，本轮）**：副本判等口径**由「字节严格一致」回退为「单纯 CRLF 差异一律豁免」**（去 CR 后一致即视为一致），并新增强制 LF 两项：① 仓库内文件一律 LF（根 `.gitattributes` `* text=auto eol=lf`）；② 部署文件一律 LF（以本仓库文件为基部署到仓库外时，一律由 main git blob 逐字节重建、不经工作树；重建后须 `逐字节==blob(去CR)` + `hash-object --no-filters==blob sha` + `CR=0` 三项全过）。§7.2 映射表保留紧凑实测、删除叙述；`grep -c $'\r'` 失守、唯一可信判据改为 Python 逐字节 `count`。AGENTS.md 同步瘦身（删冗余、与功能/角色无关信息不内联复述）。
- **meta（scripts/smoke/test_manifest.py / AGENTS.md §7.2）**：`CLEANUP_DIRS` 已收录 `github-personal-manager/regression/tmp`（PR #183），与 §7.2 记载一致；§7.2 该条目陈旧「须手动清理」注记已更正为「已收录、无需手动清理」。
- **meta（CHANGELOG.md / README.md 瘦身，本轮）**：CHANGELOG 全量统一压缩（保留「改了什么 / PR 号 / 关键验证结论」，删重复实测证据与步骤流水）；README 删除与 AGENTS.md §2 重复元信息、压缩与 SKILL.md 重复备注、修正过时路径（`D:\Documents\AI_Work_Temp`→`D:\Documents\AI_MCP-Skill-CLI`）。

---

## [2026-11-02]

### Added
- **dir/Workbuddy专属：新增 wechat-article-search 开发态副本（PR #156，`2c7b08c`/`5a0fc08`）**：纳入「微信公众号文章搜索」技能为主副本，部署态 `wechat-article-search/`；刻意排除 `tests/audit/`、`_skillhub_meta.json`（字节差恰等于二者）。判等（§7.3 旧口径）字节完全一致；CI 全量门禁 77 OK/0 FATAL/3 WARN（环境项）。
- **dir/Workbuddy专属：新增 wechat-article-to-ima 开发态副本并实施方案乙 v1.2.0（PR #162，`c06e532`/`e73192e`）**：七项（优先 `-c` Cookie 接口 / 退出码判据表 / 零结果细化 / url_resolved 降级链 / attempts 上限 / 前置依赖校验 / 双态映射修正）；CI smoke/scope-map pass。
- **dir/Workbuddy专属：新增 ima-skills 上游更新重放修复指南（PR #170，`c92c2e3`/`9e7cf95`）**：上游分发源为 SkillHub 企业源 `@tencent-adm/ima-skills`（无公开 GitHub，外部 PR 不可行）；新增《恢复指南-ima-skills上游更新重放修复.md》（317 行，九项代码 + 十项文档修复重放清单）；隐私闸门 PASS、凭证零入库。

### Fixed
- **dir/Workbuddy专属：wechat-article-search 首轮静态审计与缺陷修复（PR #158/#159/#160，`e2a1efc`/`69f4dd2`/`8809220`）**：code-review-combo 三路交叉审计得 40 发现，坐实 8 缺陷 + 2 误报；三轮迭代均由部署态复测驱动（#158→#159→#160 逐轮抓出新缺陷）。修复含 `isAntiSpider` 合法空结果豁免、北京时间口径、`parseRelativeTime` 支持「刚刚」、严格参数校验、WebSocket 帧长 RFC 6455 修正、`get_sogou_cookie.js` 单一出口、删死代码、新增 `scripts/deploy.js` 等。新增 17 回归用例，`node tests/run_tests.js` PASS=47；CI 全量 pass。
- **dir/deep-discuss：修正增强模块相对路径 CWD 漂移误判（PR #154，`783b1ea`/`840fa55`）**：部署态以相对路径搜 `references/enhancements/*.md` 因 CWD 漂移 0 命中、错误降级；新增 `scripts/discover_resources.py` 以 `__file__` 锚定技能根，SKILL.md/version-lock.md/README 同步；部署态逐字节同步 4 文件一致。

### Changed
- **dir/Workbuddy专属：更新 ima-skills 恢复指南（H1/H2/D11/D12 加固批次，PR #172，`bdaaf6b`/`6392c87`）**：§2 代码重放 9→11 项、§3 文档 10→12 项、§0.3/§0.4 检测判据同步、§4.3 加固防线验证；指南 317→411 行自包含。
- **dir/Workbuddy专属：wechat-article-to-ima 双态 QA 首轮修复（v1.2.0→v1.2.1，PR #166，`4fcacd7`/`69bc6c2`）**：收尾清扫数据丢失（改保留未成功 `.md` 至 `failed_quarantine/`）、`search_script_dir` 默认路径、ima-mcp 连通性告警、进度模板/Cookie 安全等；基线 CRLF/LF 差异归误报。
- **dir/Workbuddy专属：wechat-article-to-ima 凭据固化与 knowledge_base_id 更新（v1.2.1→v1.2.2，PR #168，`408b491`/`ee97e40`）**：凭据三层固化（环境变量 + 双副本 `ima_credentials.json` + `~/.config/ima/` 兜底，明文零入库）；SKILL.md 第 7 项凭据探测；knowledge_base_id 实测更新 `ima_kb_QFSIbCma`；部署态由 main blob 逐字节重建一致。
- **dir/Workbuddy专属：E2E 真实入库测试问题下沉修复（wechat-article-to-ima v1.2.2→v1.2.3；wechat-article-search v0.1.4→v0.1.5，PR #174，`b7be914`/`e134405`/`441e336`）**：打通 E2E 全链路（Cookie 突破反爬→检索 27→抓取 1→入库 note_id→复验命中子目录）；逐项归因下沉：Cookie 齐全性校验（`SNUID`/`SUID`）、`-c` 残缺告警、中转链接先解析、入库流程固化 2026-11-02 实测路径、第四步入库复验、`ima_api.cjs` 空响应陷阱警示。部署闭环一致；CI pass。
- **meta / dir/Workbuddy专属：修正 wechat-article-to-ima 副本映射并退役根级旧文件，闭环 PR #164（`4b2b64b`）**：`git rm` 根级单文件 `Skill-微信公众号文章抓取入iam库.md`（原拟 PR #163 因 tier5 死锁未合并，收拢本 PR 一并闭环）；§7.2 补登记映射行；放宽 pre-commit 主工作树放行清单新增 `Skill-*.md` 破除死锁；同步 README/AGENTS.md 计数。
- **meta（AGENTS.md §7.2）：复采 wechat-article-to-ima 双态实测值，闭环同步收尾（PR #165）**：部署态由 main blob 逐字节同步、0 CR、一致；§7.2 该映射行「预测」更「实测」。
- **meta（AGENTS.md §7.2）：更新 wechat-article-search 副本映射表实测值与部署方式**：首轮审计修复后复采 11 文件/102928 B、判定实质一致；补记部署方式（统一由 `scripts/deploy.js` 从 main blob 同步，不经工作树）。
- **meta（AGENTS.md §5.5）：补 dir/deep-discuss PR #154 的成对 docs(meta) 提交**：依 §5.5 目录型 commit 与 docs(meta) commit 成对模式，独立于功能 PR 走 meta 分支。

---

## [2026-10-26]

### Changed
- **dir/Workbuddy专属：memory-consolidate v2.4.0→v2.5.0「开发态→部署态」标准闭环审计与重构（PR #148，`15ff006`）**：8 步闭环审计识别 32 条 canonical findings，归因 A 类 32 / B 类 0 / C 类 0（B=0 因部署态与 blob 字节完全一致，C=0 因全实读坐实）；结构恢复 4.12 规范、条款恢复、合规修正（禁用词指针引用手册 §10.9 消除双源漂移、嵌套列表表格化、统一 LF/UTF-8 无 BOM）；正文 234→364 行。验证：skill-forge 11 维自检 60/60、矩阵 74/74、跨引擎 10/10、反向测试 GATE_VERIFIED、仓库 smoke 78 OK/0 FATAL/2 WARN、CI pass；部署态同步双副本一致。

### Fixed
- **门禁判据自身缺陷 7 处（审计中发现并当场修正）**：`mc_skill_check` 标题统计未剥离代码围栏 / 有序序号遇非有序项重置 / 禁用词清单未与 `FORMAT_BANNED_WORDS` 对齐；`mc_matrix` 3.10 把 `--no-interactive` 当子命令 / 4.C1 绝对路径「≤3」魔数 / 4.X1 全文黑名单误伤合法用法 / 4.X2·4.B2 `or` 双分支单点失效；全部以反向测试验证「修正后判据仍具检出力」。

### Changed（v2.4.0，前序条目）
- **dir/Workbuddy专属：memory-consolidate 按 skill-forge 11 维度规范全量重构（v2.3.0→v2.4.0，PR #145，`81656d5`）**：替换自创章节体系为标准模块；description 补五要素；正文 379→234 行；要求 1 写后维护手册条款、要求 2 统一简体+LF、要求 3 清理冗余（内联复述改指针）；验证 11 维 60/59/1 WARN、反向测试全翻、CI pass；部署态逐字节同步一致。
- **meta（AGENTS.md §7.2）：更正 memory-consolidate 副本映射实测值**：原「v2.4.0 51036 B / md5 `b5f62e02…`」有误——实为 CRLF 形态指纹，LF blob 为 50657 B / `3ec5f70a…`；实测新值 28400 B / `0c348c34…` 并保留历史更正值。

### Fixed
- **行尾判据失效（自检中发现并纠正）**：一度以 `grep -c $'\r'` 判行尾得出「无 CR」假阳性（Git Bash 参数被吞），改 Python 逐字节统计发现工作树为 CRLF；据此统一 LF 并写入门禁维度 0「编码与行尾」+ 反向测试。

---

## [2026-10-23]

### Changed
- **dir/code-review-combo：同步 `open-code-review-delegate` 至上游 `alibaba/open-code-review` v1.13.3 纯镜像（PR #139，`373b710`）**：上游 Step 3 取 diff 硬化为 `git --no-pager diff --no-ext-diff --no-textconv --no-color`、新增读上下文指引、大 diff 落盘机制；JSON Schema/命令参数未变；本地增强（HTML 镜像声明 / `disable-model-invocation: true` / version 注释 CLI 实测值）保全，与上游逐字一致仅 2 处偏离；换行符保持 CRLF 与 combo 内一致；回归 `guard.sh`/`test_merge_reports.sh`/`verify_combo.sh` 全 pass、部署态双副本 md5 一致。

### Fixed
- **meta（AGENTS.md + scripts/smoke）：修 scope 清单计数漂移与 tier6 版本锁假阳性**：① §2.2 标题「8 个」与表格 9 行自相矛盾（提交 `1642e93` 误改），改用 `sync-scope-manifest.py --update` 机器重写（不手改）；② tier6 以 `version-lock.md` 显式声明为唯一依据豁免 `references/enhancements/` 动态探测模块的首行标记要求（不硬塞伪版本锁）；③ 补两处门禁缺口——tier5 新增检查项 E「§2.1/§2.2 标题计数↔实际条目数」（漂移→FATAL，始终执行）、`sync-scope-manifest.py --check` 接入 tier5；④ 反向测试三项均如期 FATAL/恢复。本地全量 78 OK/0 FATAL/2 WARN。

---

## [2026-10-13]

### Added
- **dir/code-review-combo：guard.sh 新增 (e) Schema 双向一致性守卫**：实跑 `merge_reports` 产出键 ↔ SKILL.md Schema 块声明键双向相等（实现有文档无=漏写、文档有实现无=声称不存在），校验四字段枚举一致；比对逻辑独立 `tests/schema_parity.js`；缺依赖判 SKIP。
- **dir/github-personal-manager：新增 `references/push-diagnosis-and-cli-pitfalls.md`（167 行）**：推送通道分层判诊、Bash 管道退出码陷阱与假绿家族、gh 词法与同名镜像还原、无 `.git` 副本 hash-object 版本锁定、跨 shell 正斜杠纪律。

### Changed
- **dir/github-personal-manager：SKILL.md 沉淀 13 条 git/GitHub 纪律（+55 行）**：工作流八新增合并后清理三步序列 / 脚本拒清手工回收 / 终态七项复核；工作流五/九补多项；去重 3 条已覆盖不重复写入。
- **dir/code-review-combo：修正 3 处文档-实现不一致**：① SKILL.md 声称存在的扁平别名字段实从未有（改显式告知读 `severity_dist`，不改 `merge_reports`）；② `select-provider list` 写盘副作用未披露（补警示）；③ README §7.1 目录树漏列 4 文件（补 + 修正 `test_merge_reports.sh` 标注「11/11」失真实 16/16）。

---

## [2026-09-30]

### Fixed
- **meta/Memory-Data：记忆体系维护工具链 v5.3.2 修复（code-review-combo 三路审计收敛）**：F-1 `remove` 非交互 EOFError 守卫（`try/except` 捕获视为取消）；F-2 `index --force` 死参数修复（真正透传 + 绕过三处守卫）；子文件头索引幂等缺陷修复（`orig_content` 作基准，普通 `index` 对已收敛体系为空操作）；`test_memory_system.py` 新增 `index --force` 用例（覆盖矩阵 28→29，全 PASS）；`test_manifest.py` 的 `--list-tests` 列宽粘连修复（按最长 scope 动态）。

### Added
- **meta/AGENTS.md + scripts/smoke：建立测试资产「唯一测试源」纪律与调度**：新增 `scripts/smoke/test_manifest.py`（全仓测试资产唯一清单，四能力 `list_tests`/`run_project_tests`/`cleanup`/`scan_unregistered`）；扩展 `run_all.py`（`--list-tests`/`--project-tests [--allow-real]`/`--cleanup`，仅加性 flag）；AGENTS.md 新增第 9 章「测试资产纪律」（唯一测试源 / 四类入口 / 扫描复用优先 / 收尾打扫 / 资产管理）；决策：项目级测试不接入远端 required CI。

### Changed
- **meta/AGENTS.md 第 9 章体系化补强**：初版 §9.1–§9.6 补强为 §9.1–§9.7（层级关系 / 统一入口调度 / §9.6 分步流程 / §9.7 清单与 CI 协同）。
- **file/task-methodology-consolidation：升级至 v3.2.1**：撤回 `Workbuddy专属/Skill-task-methodology-consolidation.md` 未跟踪副本，统一以根级单文件为唯一开发态；版本 3.1.0→3.2.1（脱敏闸门/双前缀/落盘位置细化，对外契约不变）。

---

## [2026-10-01]

### Changed
- **file/task-methodology-consolidation：升级至 v3.4.0（deep-discuss 七阶段调研后 B+ 方案，`3.2.1→3.4.0`）**：第七节「经验提炼三原则」升级「三问闸门」（价值/可移植/查重）；第十节自检清单同步；description 补触发词；对外契约不变。

### Added
- **file/task-methodology-consolidation：第十七节「产物级查重与 See Also」**（三处置：并入/补指针/新建）、**第十八节「交付前部署态核验」**（开发态与部署态 md5+cmp 一致，字节不同根因通常为部署态旧副本）、**第八节「可复用产物六项强制校验」**；部署态路径事实更正（实测 `%USERPROFILE%=C:\Users\Administrator`，md5 `c1fb5928…`/26255 B 一致）。

### Fixed
- **dir/code-review-combo：开发态→部署态双态审查与 BUG 修复闭环（PR #115，6 缺陷 + 1 加固）**：F-1 `select-provider` 选路「文件存在」→「目录存在」+ 写前 `mkdirSync`，修复部署态 100% 崩溃；F-2 `verify_combo.sh` 硬假设「上两级=仓库根」→ 逐级探测 `.git` + `OCR_REPO_DIR`；F-3 `guard.sh` `py_compile` 残留 `__pycache__` → 即时清理；F-4 `test_merge_reports.sh` 误用 `select-provider` 当 node 探针（假绿）→ 改 `command -v node`；F-5 `merge_reports` 有效报告 0 份仍正常退出（假绿）→ `usableReports===0` 时 exit 1；F-6 `verify_combo.sh` comments 为 0 仍 PASS（假绿）→ 单独 WARN。部署态 5 修复文件逐字节 `cmp` 一致；无 P0/P1/P2 未关项。

### Added
- **meta/AGENTS.md 第 7 章新增 §7.2「开发态↔部署态映射表」（唯一映射登记处）**：一次坐实 7 组双态映射，每条附实测字节/行数/去 CR 后 md5 与判定；规定落地部署前须先补登记防三种漂移；§7.5 明确本表为人工维护段。

### Fixed
- **meta/AGENTS.md §7.3 新增「副本判等口径」硬规则（本轮主要纠错）**：原仅「md5 一致即一致」未定义 CRLF/LF，易误判版本分叉；实测 3 组副本字节差恰等于行数（每行多一 CR），去 CR 后 md5 相同、diff 0 行 ⇒ 实质一致；判等口径补正为「`tr -d '\r'` 后 md5 相同 且 diff 0 行」，CRLF/LF 差异不计实质差异。（**注：此口径已于 2026-11-04 先升级为字节严格一致、后再回退为 CRLF 豁免，见本文件最新条目**）
- **meta/AGENTS.md §7.4 记录 `self-improvement` 同名占用（用户 2026-10-01 裁决：保留部署态增强版 `self-improvement-system__skillhub`，移除未部署冗余仓库副本 `dir/self-improvement`）**：删除不影响运行时；§7.4 改写为「已裁决并执行」+ 门禁联动硬约束（目录型删除与摘登记拆两条 PR）。
- **meta/AGENTS.md §7 章标题修正**：由「以 chrome-devtools 为唯一定义对象」改为「chrome-devtools 为典型定义对象，映射见 §7.2」。
- **fix(.githooks/pre-commit)：§2.3 meta 特例 case glob `*/\*` 把星号转义为字面量（永不命中正常路径）→ 修正为 `*/*`，破除与 smoke Tier5 双向 dir 校验的死锁；未用 `--no-verify`**。

### Removed
- **dir/self-improvement（PR 删除）：移除从未部署的目录型 Skill 副本**（5 文件 -353 行），删除前仓外备份 `.workbuddy/backup-self-improvement-20261001175854/`，md5 对齐可取回。

---

## [2026-09-24]

### Changed
- **meta/Memory-Data：维护工具链 v5.2.1→v5.2.2→v5.2.3 双背靠背审计质证修复（豆包 + DeepSeek）**：成立项改代码、不成立项实测否决。要点——v5.2.3 原子写（落 `.tmp`+`os.replace`，中途崩溃原文件不动）、verify 第5项非 git 环境判 SKIP、`check/validate --auto-fix` 停用（禁盲修）、§10.10 引用方向改 Agent 判读、单一事源抽出 `MANUAL/MAIN/ALLOWED` 常量、循环检测收敛迭代式、YAML 行内 `#` 按规范剥离、`selftest` 27 项核心回归；手册同步至 v5.2.3。v5.2.2 修 P0-1 `index --file X` 整区重写破坏（改只刷新该文件头索引）、P0-2 `check --fix` 整行删除（停用自动修复）、P0-3 同文件锚点正则缺上下文约束、YAML 对称反转义、`route` scope 逐条切分、`add` 以磁盘子文件为准；手册同步 v5.2.2。v5.2.1 修 P0 `_collect_headings_for_anchor` 按组收集致 rewrite 错配（改单遍顺序+跳围栏+告警），新增 `route`/`next-num`/`verify` 子命令、`check` 维度13/14，手册同步 v5.2.1。§8.5 新增「删除测试 fixture 的配套改造」。

---

## [2026-09-18]

### Changed
- **dir/web-search：升级 anysearch 上游 vendored 副本至 v3.1.1（上游 commit 9b91ee21，PR #81，`ef2a19aa`）**：同步上游删除/新增文件，纯副本一致性维持。

### Fixed
- **dir/web-search：F1 孤儿文件剪枝**（`sync_anysearch.py` 新增 `_compute_orphans`/`--prune`，清理 ALLOWLIST 外孤儿，report-only 默认向后兼容）+ 回归测试；**F2 `check_anysearch` 标注遗留单文件视角**（与 `check_anysearch_subtree` 结论可能不一致，统一以 subtree 为准，不移除功能/不改契约）。

---

## [2026-09-17]

### Added
- **meta：新增 AGENTS.md 第 8 章「开发态目录型 Skill 最小化纪律」**：约束全部目录型 Skill 保持最小/可移植/通用，五类文件（可下载/可派生/编译>100MB/过程垃圾/测试衍生）禁纳入版本控制；`.gitignore` 补 `build/`、`dist/`。

### Changed
- **meta/AGENTS.md §7.1：最小化原则改为引用第 8 章**（单一事实源）。

### Removed
- **meta：删除 `Workbuddy专属/workbuddy-workspace-migration/scripts/__pycache__/purge.cpython-314.pyc`**（编译派生产物，违反第 8 章）。

### Changed
- **meta/AGENTS.md：背靠背审计报告（Deepseek H1–H12、豆包 P01–P18）质证整改，23 处修订**：根级 Skill 数量误报 9→8、消除主副本 vs worktree 冲突、收紧 pre-commit 放行清单（移除「隐藏文件」泛化、密钥拒绝生效）、根级文件归入 meta、统一 scope 标识、CI 触发改矩阵+required 集合、区分授权与 `--confirm` 闸门、厘清单一事实源层级、修正悬空引用 §5.5→§2.4/§3.2、§8.5 `.gitignore` 走 meta、细化 §8.3/§8.1/§0.3 等。

### Fixed
- **pre-commit 安全缺口修复（真实风险）**：主工作树放行清单含 `\.*`（隐藏文件通配）且排在密钥拒绝行前，致 `.env` 等密钥被隐性放行；移除 `\.*` 并补全 `@*.md`/`mimo_mcp.py`，与 §2.3/§3.2 meta 清单一致，密钥拒绝真正生效。

---

## [2026-09-15]

### Changed
- **meta/`dir/Workbuddy专属`/`dir/github-personal-manager：放宽目录名 ASCII-only 阻断至简体中文白名单**（`[\u4e00-\u9fa5A-Za-z0-9 _-]`，向后兼容；`Workbuddy专属` 纳入 `MANUAL_KEEP_DIRS` 豁免，§2.1 登记保留）。

### Fixed
- **pre-commit 分支正则 `\u4e00-\u9fa5` 转义失效**（`LANG=C.UTF-8` 下 `grep -Eq` 不识别，中文分支名被误判非 worktree 纪律分支）；改字面量 `一-龥`（与 `sop_scope_check.sh` 一致），实测 `MATCH_OK`。

---

## [2026-09-03]

### Added
- **open-medical-skills/：新增目录型 Skill（中文医学分析编排，父编排+子 vendored 副本，离线确定性部署）；AGENTS.md §2.1 登记（目录型 12→13）**。

---

## [2026-08-28]

- fix(dir/self-improvement): 完善 self-improvement SKILL.md 格式规范
- docs(Memory-Data): 更新 WorkBuddy 记忆文件说明
- feat(dir/self-improvement-system__skillhub): 新增 self-improvement 目录型 Skill
- feat(file/external-tool-onboarding): 新增外部工具引入评估根级 Skill
- refactor: 记忆体系重构，拆分 MEMORY.md 为多个子文件
- chore: 清理重复 Skill 文件

---

## [2026-08-21]

### Fixed
- **CI/ruleset 矛盾修复**：main 规则集 required_status_checks 要求 `smoke`+`smoke-scoped`，但 smoke.yml 对非 meta 跳过 `smoke`、对 meta 跳过 `smoke-scoped`，致任何 PR 都有一条 skipping 无法合并；修复：`smoke` 恒运行基础门禁、`smoke-scoped` 不列入规则集、required 仅留 `smoke`。

### Changed
- **main 分支保护机制切换（ruleset→classic）**：实证 ruleset `required_status_checks` 存在平台缺陷（#30-#34 多轮无效），切换 classic branch protection（required `smoke`、strict=false、enforce_admins=true），普通合并恢复正常无需 `--admin`。

### Added
- **github-personal-manager：新增 `workflows/wf_branch_clean.sh`**（一键回收已合入 main 本地分支）+ 补齐 `workflows/README.md` 断链。

---

## [2026-08-20]

### Docs
- **Memory-Data/**：`Deepseek++系统提示词-2.md` 重命名为 `Deepseek++系统提示词.md`（合并）；清理 `codebase-memory/.../logs/.gitkeep` 空占位。
- **AGENTS.md / README.md**：修复纪律文档断链——AGENTS.md 4.2 worktree 脚本引用补 `github-personal-manager/scripts/` 前缀、`--branch` 统一 `feat/<topic>`、`uv run`；README 移除已不存在的 `md-crossref-audit` 条目，活跃技能数更正 17（9 目录型+8 根级单文件）。

---

## [2026-08-19]

### Added
- **codebase-memory/：纳入仓库跟踪**（此前被 .gitignore 整体忽略；codebase-memory-mcp.exe 约 282MB 超 100MB 硬上限未入库，改占位+下载说明；.gitignore 同步忽略 exe 与 `code-review-combo/config/providers.json`（含真实 API key，仅本地））。

---

## [2026-08-14]

### Fixed
- **github-personal-manager/scripts/：收敛 P-GPM 系列缺陷**——P-GPM-1/2（`gh` 缺 `--repo`，5 脚本补显式传递）、P-GPM-3（`_sop_resolve_remotes` 改 `git config --get` 替代 `git remote -v` 防 insteadOf 污染）、P-GPM-4（`sop_worktree_add.sh` 补 `cygpath -m` Windows 路径归一化）；`wf_branch_clean.sh` 越层 `gh pr list` 缺 `--repo` 已补。

### Added
- **github-personal-manager/regression/：离线回归框架纳入**（三层夹具 + fake gh 对抗桩，67 用例覆盖 17 脚本；`run.sh` 自定位 + `TEST_TMP` 断言；`.gitignore` 加 `regression/tmp/`；`regression.yml` 便携 CI 参考）。
- **github-personal-manager/workflows/：补全 GUI 工作流脚本通道**（`wf_common.sh` + 7 父脚本，统一 `--confirm` + 只推 origin/绝不碰 upstream）。

### Docs
- **github-personal-manager/SKILL.md / workflows/README.md：补 Windows 环境约束注记**。

---

## [2026-08-12]

### Fixed
- **ref-material-writing：迭代收敛修复**：定义层消除 5.3 自相矛盾、清除机器/项目专属路径硬编码、模糊词改客观判据、补 description「适用于」；代码层 F1（constants.json 缺失 SAFE_DOMAINS 兜底）、F2（`_call_api` 200 非 JSON 容错）、F3（`_load_env` 仅注入白名单）、F4（默认路径可读报错）、F6（max_results 1–10）、F7（key=value 去引号）、F8（SHA 归一化）、F9（`_render_doc` 容错）、复审计 N1/N2；新增回归测试 `test_anysearch_cli.py`（33 例全过）；双层复审计 0 致命/0 严重。

### Added
- **根级单文件技能新增 3 个**：`Skill-外部工具引入评估与落地.md`、`Skill-对当前对话会话做经验沉淀和方法论固化.md`、`Skill-文档引用调用有效性检验.md`；新增调研报告 `github-personal-manager-同类项目调研_20260812.md`。
- **chrome-devtools 双端部署**：新增 `sync_and_deploy.cjs`/`mirror_to_target.cjs` 与 `localization/*.cjs` 本地化/同步部署脚本（master→WorkBuddy 安装副本）；package.json/.npmrc/README/SKILL 同步。

### Changed
- **chrome-devtools/SKILL.md**：补双端部署工作流与脚本用法。
- **Workbuddy专属/Skill-memory-consolidate.md、Skill-workflow-distill.md、mimo-code-collab/SKILL.md、Skill-元技能(Skill创建校验器).md**：文档/定义更新。

### Removed
- **Skill-文件内容整理重组.md、Skill-多代码审计报告归一收敛.md**（由 `Skill-多源代码审查整合收敛.md` 承接）、**tender-review-kit/.github/workflows/ci.yml**。

### Docs
- **README.md**：技能总览 16→18（9 目录型+9 根级），移除 file-structure-organizer、更新 code-audit-consolidation 指向、新增 3 根级。

---

## [2026-08-08]

### Changed
- **github-personal-manager/SKILL.md**：主文档重写（阶段 0 工具探测、脚本调用约定、结构化报告规范）。
- **github-personal-manager/scripts/sop_worktree_*.sh**：worktree 三件套增强（冲突/合并守卫）。
- **mimo_mcp.py**：工具逻辑更新（+392 行），完善双形态（dmcp.exe 中继/宿主直连）与可观测性。
- **Memory-Data/*.md、Skill-文件内容整理重组.md、Workbuddy专属/Skill-memory-consolidate.md**：同步更新。
- **.github/workflows/smoke.yml**：CI 微调。

### Docs
- **github-personal-manager/references/**：fork-ci-pitfalls.md/gh-capability.md 同步；smoke/README.md 与 test_worktree.sh 对齐。

---

## [2026-08-06]

### Added
- **chrome-devtools/**：新增目录型技能（Chrome DevTools MCP 驱动本地浏览器调试/自动化/性能/Lighthouse/网络，全局安装 `chrome-devtools-mcp`，禁用 `npx -y`）。
- **skill-forge（合并）**：原 `Skill-元技能，Skill创建助手.md`+`Skill-元技能，Skill校验器.md` 合并为 `Skill-元技能，Skill创建校验器.md`（v3.0.0）。
- **file-structure-organizer、code-audit-consolidation**：新增根级单文件技能。
- **Memory-Data/**：新增协作方式约定（四象限定制/通用版）、用户画像分析报告（土木工程主业版→重命名）。

### Changed
- **web-search/SKILL.md**：新增中文政策/国标检索特别规则；`web-search/firecrawl/SKILL.md` 访问形态探测说明。
- **Workbuddy专属/Skill-memory-consolidate.md**：整合「文件结构化组织规范」十二项。
- **Workbuddy专属/Skill-workflow-distill.md**：升 v1.1.0。
- **Memory-Data/长期记忆_Deepseek++.md**：补 Node/npm/npx 全局安装铁律。

### Removed
- **Skill-元技能，Skill创建助手.md、Skill-元技能，Skill校验器.md**（并入 skill-forge）；**multi-worktree-parallel-merge-sop.md**（能力内聚 `sop_worktree_*.sh`）；**Memory-Data/用户画像分析报告_土木工程主业版.md**（重命名）。

### Docs
- **README.md**：技能总览 14→16（9 目录型+7 根级），合并 skill-creator/checker 为 skill-forge，新增 chrome-devtools/file-structure-organizer/code-audit-consolidation。

---

## [2026-08-04]

### Fixed
- **github-personal-manager**：修复 5 脚本 `--help` 仅显 7 行且泄漏 `HELP-START` 标记（`-h` 改 `_sop_print_help` 标记块提取，新增 `scripts/lib/sop-common.sh`）。

### Docs
- **github-personal-manager**：全量 25 脚本/配置/冒烟文件补头部注释（功能/场景/用法/注意事项），统一 `HELP-START`/`HELP-END` 标记约定。

---

## [2026-08-03]

### Added
- **playwright-360chrome/**：新增浏览器自动化技能（Playwright+360Chromex 内核 v2.0.0）。
- **github-personal-manager 多工作树并行开发 SOP**：`sop_worktree_add/cleanup/merge.sh` 三件套 + 顶层 `multi-worktree-parallel-merge-sop.md`（后 2026-08-06 移除）+ 冒烟 `test_worktree.sh`。
- **Memory-Data/**：新增 GitHub_Deepseek++.md/长期记忆_Deepseek++.md/用户画像分析报告_土木工程主业版.md。

### Changed
- **.gitignore**：Memory-Data 忽略策略改为「仅排除非 .md」，撤销 2026-08-02 整体排除。
- **github-personal-manager**：SKILL.md/`sop-common.sh`/`sop_fetch_prune.sh`/`sop_resolve_repo.sh`/references/config 多处调整；smoke 测试修订；文档同步门禁明确「禁止本地编译」。
- **.github/workflows/smoke.yml**：升级 actions 至 v7。
- **Memory-Data/GitHub_Deepseek++.md**：扩充。
- **ref-material-writing**：自包含改造收口——AnySearch CLI 调用统一改基于技能目录相对路径 `scripts/anysearch_cli.py`（不依赖 CWD）；修正"硬编码路径"措辞，Tier0+Tier1 通过。
- **web-search**：解耦重构为「父 Skill 双轨架构」——父 web-search 持有本地化/私有化约束与五级裁决；AnySearch 轨道并入上游 `anysearch-ai/anysearch-skill`（扁平并入、非 clone、不能 `git pull`）；Firecrawl 轨道改全局官方 CLI（v1.19.27）+ `web-search/firecrawl/SKILL.md` 适配层；删冗余 references；AnySearch 调用严格 `uv run --with requests python`。

### Moved
- **workbuddy-workspace-migration/、Skill-memory-consolidate.md、Skill-workflow-distill.md** → `Workbuddy专属/`。

### Removed
- **Skill-代码审查.md**（能力并入 code-review-combo）。

### Fixed
- **web-search 解耦回归修复（code-review-combo 多轮交叉审计）**：F2 密钥加载回归（补第三级探测）、C8 密钥落盘风险（删 `firecrawl env` 写 .env 路径、禁落盘）、F3/F4/F5/F7/F9/F10/F11/B10/B11/C3/C13 调用契约与文档一致性（统一 `uv run --with requests python`、清 `D:\Tools\Assembly` 硬编码）、回归测试 `test_fixes.py`（6 用例）+ Tier3 接入；说明 `web-search/.env` 明文持 ANYSEARCH_API_KEY 为用户授权豁免（仅覆盖该密钥）。

### Docs
- **README.md**：技能总览「12 个」→「14 个」，移除 github-repo-sync/anysearch-skill、新增 code-review-combo/mimo-code-collab/playwright-360chrome/Workbuddy专属 迁移项。

---

## [2026-08-02] · 发版 v2.2.1

### Fixed
- **github-personal-manager**：修复 `_sop_resolve_remotes` UPSTREAM_REPO 漏填（M1）、`sop_branch_merged_status.sh` GH_USER 未解析干净跳过（M2/M3）、`sop_fetch_prune.sh` dry-run 与 confirm 范围一致（L1）、`sop_resolve_repo.sh`/`sop_sync_upstream.sh` 解析失败优雅降级（L2）、`sop_resolve_repo.sh` 补 `-h/--help`（L5）。

### Added
- **github-personal-manager 冒烟测试**：新增 `test_contracts_extra.sh`（M4，覆盖 open PR 反向识别/GH_USER 跳过/sync_upstream 核查），用例 +3（PASS=59 SKIP=1）。

---

## [2026-07-31]

### Added
- **github-personal-manager：新增「提交前文档同步门禁」**——`sop_docs_sync_check.sh`（Tier1/2/3 分层，dry-run 只读、未同步退出 2）+ `references/docs-sync-checklist.md`；新增 `sop_resolve_repo.sh` 提取仓库三元组。
- **仓库新增技能**：`code-review-combo/`（review-spd + open-code-review-delegate 双子技能）、`workbuddy-workspace-migration/`、根级 `Skill-memory-consolidate.md`/`Skill-workflow-distill.md`/`Skill-代码审查.md`。
- **github-personal-manager 冒烟测试**：新增 `test_contracts.sh`。

### Changed
- **github-personal-manager**：SKILL.md 重写（where.exe 探真实路径、二次显式授权第 6 条、三元组提取节）；`sop-common.sh` 新增 `_sop_resolve_remotes`；config 模板同步。
- **tender-review-kit**：SKILL.md/SKILL-zw/FOR_AI/INSTALL/QUICKSTART/README + 多个 scripts/tests 全面更新。
- **Memory-Data/GitHub_Deepseek++.md**：大幅扩充。
- **mimo_mcp.py**：小幅调整。
- **README.md/@文件读写通用模块.md/@Skill 调用子 Skill 和外部工具的范式.md/web-search/scripts/anysearch_cli.py**：配套微调。

### Removed
- **github-personal-manager/docs**：删除 gitextensions-integration.md/scripts-catalog.md/sop-plan.md 三份旧文档。
- **test_mimo_mcp_smoke.py**：离线冒烟退役（由新增冒烟体系承接）。

### Docs
- CHANGELOG 新增本条，记录本次仓库全量更新（含文档同步门禁能力落地）。

---

## [2026-07-24]

### Removed
- **github-repo-sync（Skill-GitHub仓库同步助手.md）**：删除独立技能（六步同步中 1–5 与 github-personal-manager 重复且双触发歧义，备份留存 `_skill_backup/`）。

### Added
- **github-personal-manager**：新增 `scripts/sop_sync_report.sh`（合并前本地 tip 为基准的上游更新分析报告）；**mimo_mcp.py** 新增 `mimo.metrics` 可观测性 + 形态A/B 双形态说明。
- **mimo-code-collab**：新增离线冒烟 `test_mimo_mcp_smoke.py`（校验 v2.2.0 关键契约）。

### Changed
- **github-personal-manager**：工作流一新增「第四步生成上游更新分析报告」、输出格式约束第 5 条结构化报告硬规则。
- **mimo_mcp.py**：默认超时 300s→900s、mcp.json 改绝对 venv python 路径；版本 v2.1.0→v2.2.0。
- **mimo-code-collab（v5→v6）**：能力边界明确「mimo 可在 working_dir 内生成/修改文件」；形态A 具体化 dmcp.exe 中继 + 两条跨平台部署要点；invocation/test-matrix/cases-and-pitfalls 增补。

---

## [2026-07-23]

### Added
- **mimo-code-collab**：新增「强制连接韧性约束」（★ 最高优先级，超时/失联原样重试 2 次，连续 3 次失败才降级）；github-personal-manager 补冒烟用例。

### Changed
- **mimo_mcp.py**：`openai` 包首次调用懒加载缓存，缩短 dmcp 冷启动窗口。
- **github-personal-manager**：修复 `ci_rerun` 调用错误、统一文案。

### Removed
- 清理 `anysearch-skill` 子技能目录及仓库规划草案 `仓库规划与冒烟测试方案（草案v0.1）.md`。

---

## [2026-07-22]

### Fixed
- **ref-material-writing**：全量审核 12 项修复，新增 4 份自检标准档；officecli 空白 docx 实测 G1b 通过。

---

## [2026-07-19]

### Fixed
- **ref-material-writing**：补齐状态文件「工具能力映射表/访问形态」并同步 compatibility 计数。

### Changed
- 将 `MCP-MemPalace-memory-data` 记忆宫殿产物（数据库）加入忽略，不上传远端；完善 Deepseek 记忆模块 MCP 工具执行硬约束。

---

## [2026-07-17]

### Docs
- 新增仓库 `README.md`，逐技能说明用途与外部依赖；准备 v1.0.0 发布。

### Added
- 仓库初始化与首批私有技能集合落地（github-personal-manager、mimo-code-collab、ref-material-writing、web-search 等）。

---

格式参考 [Keep a Changelog](https://keepachangelog.com/)，条目按时间倒序排列。分类约定：
**Added**（新增能力）/ **Changed**（行为或实现变更）/ **Removed**（移除）/ **Fixed**（缺陷修复）/ **Docs**（文档）。

> 本文件由 git 历史汇编，每条对应实际提交主题；最新一条即最近一次推送的提交。
