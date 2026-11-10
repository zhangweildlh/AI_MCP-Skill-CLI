# 微信公众号文章抓取入ima库技能

---
name: wechat-article-to-ima
description: 按关键词检索微信公众号文章，抓取正文并生成一文章一 Markdown 文件，批量存入腾讯 ima 知识库指定子目录，入库后复验内容完整性。关键词：微信公众号、文章检索、正文抓取、ima 知识库、批量入库、断点续跑、限流退避、任务卡轮转。当用户要求「抓取某主题的公众号文章并存入 ima」「把公众号文章入库到指定目录」，或用户输入包含「公众号文章抓取」「微信文章入库 ima」「按关键词抓取公众号文章」等指令时触发此技能。适用于按单个关键词或关键词组合批量采集公众号文章，并归档到 ima 知识库子目录的场景。不适用于行业政策深度调研、文章内容改写或摘要化处理，也不适用于 ima 以外的其他知识库产品。
license: Proprietary
compatibility: 依赖技能 wechat-article-search（检索）、技能 ima-skills（入库）、原生网页抓取能力（正文抓取）；可选依赖浏览器自动化能力与网页抓取服务用于兜底。需要可访问互联网，且已配置目标 ima 知识库的接口凭据。
metadata:
  author: zhangweildlh
  version: 1.3.0
  category: knowledge-management
allowed-tools: Bash Read Write Edit WebFetch
---

## 角色与目标

你是一名微信公众号文章采集与归档专员。你的职责是：在被调用时，读取工区进度文件，确定本轮执行的任务卡与关键词簇，在微信公众号中检索文章，抓取正文后每篇单独存为一个 Markdown 文件，批量存入腾讯 ima 知识库的指定子目录，并在入库后复验内容确实完整。

本技能不负责调度。触发即执行。

## 参数配置区（唯一维护入口，全部带默认值）

本区是本技能唯一需要维护的地方。所有参数均有默认值，因此**用户零输入即可直接执行**。

参数取值优先级：本次调用传入的参数 ＞ 任务卡配置表取值 ＞ 通用默认值。用户传入的参数**仅本次生效**，不写入任何文件，也不改变本区默认值。

### 通用默认参数

| 参数名 | 类型 | 默认值 | 说明 |
| ------ | ------ | ------ | ------ |
| workspace | 字符串 | D:/Documents/AI_Work_Temp/ima+WorkBuddy | 工区绝对路径。临时文件、状态文件、进度文件一律直接存放于该根目录，不建子目录 |
| knowledge_base_id | 字符串 | ima_kb_QFSIbCma | 目标 ima 知识库标识（2026-11-02 经 ima 开放接口 `get_addable_knowledge_base_list` 实测更新；旧值 `eGuTHK4Ve1i9wX7bE4Sj7n2B_Jb1WnOdqYlGRo91RQM=` 已失效，服务端要求 `ima_kb_` 前缀加 8 位字母数字格式） |
| card_id | 字符串 | 空值 | 任务卡标识。传入时执行该卡；留空时按进度文件自动轮转选择 |
| folder_id | 字符串 | 由 card_id 经任务卡配置表推导 | 目标子目录标识。A 卡为 folder_7511772189689986 |
| keywords | 数组 | 由 card_id 与轮转序号推导 | 本轮检索的关键词簇。A 卡主词簇为工程总承包、EPC、总包 |
| rotate_index | 整数 | 空值（两簇全搜） | 轮转序号，0=主词簇、1=变体词簇；传入时只检索该序号对应的词簇，未传入时主词簇与变体词簇逐一全搜（详见「任务卡轮转规则」） |
| search_script_dir | 字符串 | 由前置依赖检查解析的技能基址下 `wechat-article-search/scripts`（即 `<技能基址>/wechat-article-search/scripts`） | 检索脚本所在目录，由该技能自身提供，本技能不内置该脚本；执行体须据此**绝对路径**拼接步骤 4 的命令，禁止将本描述原文当作路径 |
| max_results | 整数 | 50 | 单个关键词检索返回条数上限，检索脚本内部硬上限为 50 |
| cool_down_seconds | 整数 | 120 | 每检索完一个关键词后的冷却秒数，用于规避平台频控 |
| min_chars | 整数 | 800 | 正文最小字符数闸门，低于此值判定内容不完整 |
| min_periods | 整数 | 5 | 正文最小句号数**软告警**阈值：低于此值但满足任一辅助判据（正文段落数 ≥ 3 / 含结构化表格或列表 ≥ 2 项 / 标题层级 ≥ 2）时不自动拒，标记 `periods_low` 交人工复核（详见「完整性闸门」） |
| cycle_days | 整数 | 10 | 同一张任务卡两次执行的目标间隔天数，仅用于计算下次到期日 |
| max_attempts | 整数 | 4 | 判定为平台限流后的最大重试次数，超出则停止硬试 |

### 任务卡配置表（目标子目录与关键词簇）

| card_id | 名称 | folder_id（目标子目录） | 主词簇（轮转序号 0） | 变体词簇（轮转序号 1） |
| ------ | ------ | ------ | ------ | ------ |
| A | 总包 | folder_7511772189689986 | 工程总承包、EPC、总包 | 总承包EPC、EPC总承包 |
| B | 城更 | folder_7512040100861636 | 城市更新、一老一小、小区改造、城中村改造、街区改造、社区改造、城市合伙人、智慧城市、海绵城市、基础设施改造 | 有机更新、微更新、城市双修、小区整治、城中村更新、街区整治、街区打造、社区整治、社区打造、基础设施更新 |
| C | 全域土地 | folder_7512041610809167 | 全域土地综合整治、拆旧复垦、人居环境整治、千万工程、城乡融合发展、宜居宜业和美乡村、生态修复、耕地碎片化治理、智慧农业、智慧农田、山水林田湖草沙一体化、撂荒地治理 | 全域整治、生态保护修复 |

轮转含义：轮转序号为 0 时用主词簇，为 1 时用变体词簇，每成功执行一轮后序号在 0 与 1 之间切换。变体不是删除，而是排到下一轮，因此长期覆盖不丢失。

## 前置依赖检查（执行前必做，缺失即暂停）

本检查必须基于**确定性的绝对路径**执行，严禁依赖运行时对 `~` / `$HOME` / `os.path.expanduser("~")` 的解析。本环境执行沙箱中 `$HOME` 被虚拟化为 `/HOME`，而真实用户级技能位于用户配置文件目录下；若信任 HOME 会把空目录 `/HOME/.workbuddy/skills` 误当作技能目录，导致四项依赖被统一误报缺失。

### 技能目录基址解析（按序取首个存在且非空者）

1. 若环境变量 `WORKBUDDY_SKILLS_DIR` 已设置且非空，以其为基址。
2. 否则使用 Windows 系统标准变量推导用户级技能目录，跨机器、跨账户自动适配，切勿硬编码用户名：`%USERPROFILE%\.workbuddy\skills`（Windows 原生 cmd / PowerShell），Git Bash / POSIX 下等价写作 `$USERPROFILE/.workbuddy/skills`。
3. 若上述基址不存在或为空目录，不得直接判定依赖缺失，须先回退重探一次第 2 条的标准变量路径。
4. 解析到的基址一律归一为正斜杠形式用于探针（例如 `$USERPROFILE/.workbuddy/skills`），避免 Windows 反斜杠在 POSIX shell 中被转义导致路径畸形。

### 逐项检查（每项均须同时满足：目录存在且内含 SKILL.md）

> **硬依赖（缺失即阻断本轮，见「缺失处置」）**：第 1、2 项。
> **可选依赖（仅用于抓取降级链 3 级兜底，缺失不阻断，运行时降级）**：第 3、4 项——本技能不调用 `web-search` 主检索，仅在 1 级原生抓取失败、且 `firecrawl` 官方 CLI 与 `FIRECRAWL_API_KEY` 均可用时，复用其 `firecrawl scrape` 作为兜底；二者任一缺失则 3 级不可用，转由 2 级（浏览器自动化，Agent 手动兜底）或标记抓取失败。

1. `wechat-article-search`：基址下 `wechat-article-search/` 目录存在且含 `SKILL.md`，并确认其 `scripts/` 子目录下存在 `search_wechat.js` 与 `get_sogou_cookie.js`（优先 `-c` 接口取 Cookie 与检索均依赖这两个脚本，缺失则检索 / 取 Cookie 将失败）。
2. `ima-skills`：基址下 `ima-skills/` 目录存在且含 `SKILL.md`（正确标识为复数形式 ima-skills，不含单数形式的 ima-skill）。
3. `web-search`（可选）：基址下 `web-search/` 目录存在且含 `SKILL.md`。仅作为 3 级抓取的父层（firecrawl 适配层所在目录）存在性参考。
4. `web-search` 的火爬适配层（可选）：基址下 `web-search/firecrawl/` 目录存在且含 `SKILL.md`。3 级抓取实际复用其封装的官方 `firecrawl` CLI（`firecrawl scrape <URL>`），需本机已全局安装 `firecrawl` 且 `FIRECRAWL_API_KEY` 就绪（或 `web-search/.env` 已配置）。
5. 探测浏览器自动化能力是否可用，仅作记录，不作为阻断项。
6. **ima 知识库连接器（ima-mcp）连通性探测（告警项，非阻断）**：确认 ima-mcp 已连接且已授权；若未连接/未授权，须显式告警并提示用户确认 ima-mcp 已连接后再继续「入库流程」，避免「前置依赖检查通过却运行中入库失败」。同时须将 `search_script_dir` 解析为 `<技能基址>/wechat-article-search/scripts` 并用于步骤 4 命令拼接。
7. **ima 凭据可用性探测（告警项，非阻断）**：确认 ima 开放接口凭据（client_id / api_key）已配置且有效，按以下**优先级**解析，任一层存在即视为具备：
   - ① 环境变量 `IMA_CLIENT_ID` 与 `IMA_API_KEY`（**最优先**，用户级持久化或本次执行已注入，明文不落盘）；
   - ② 用户真实主目录下 `~/.config/ima/client_id` 与 `~/.config/ima/api_key`（`ima_api.cjs` 原生兜底；须用 Node 侧 `os.homedir()` 的真实用户目录解析，本环境执行沙箱中 `$HOME` 被虚拟化，不可直接采信）；
   - ③ 技能目录内 `ima_credentials.json`（读取 `client_id` 与 `api_key` 字段后注入本次执行进程的环境变量使用；**仅作兼容遗留兜底**，该文件含敏感凭据，禁止入库、禁止回显明文、禁止写入进度文件或日志）。
   **推荐**：将凭据移出技能目录，改用环境变量或 `~/.config/ima/`，技能目录内 `ima_credentials.json` 仅作兼容遗留且禁止入库；三层皆缺时显式告警并提示用户配置凭据后再执行入库流程（检索与抓取不受影响）。凭据有效性的判据：以凭据调用 ima 开放接口（如 `openapi/note/v1/list_notebook`）返回业务码 0。

### 前置：chrome-devtools 调试浏览器就绪（与 wechat-article-search 呼应）

本技能经 wechat-article-search 提取 `weixin.sogou.com` Cookie 以绕过会话维反爬；该 Cookie **依赖 chrome-devtools 已就绪的真实调试浏览器**（含站点登录态 / Cookie）。执行检索前必须满足：

1. 确认 chrome-devtools 已激活：其 `start.cjs` 已自动探测真实调试浏览器端口（按 UA 过滤跳过 9222 上的 WorkBuddy 自身 Electron），并写入 `local-config.json` 的 `debugPort`。
2. 读取该端口，经环境变量 `SOGOU_CDP_PORT` 传给 `get_sogou_cookie.js`（本技能不再依赖 9223 硬编码默认）；未就绪时先按 chrome-devtools 流程拉起（复用真实浏览器登录态 / `User Data` 拷贝方案），再继续。
3. **调试端口必须实测连通，不得只读配置文件（2026-11-05 实测修正）**：`local-config.json` 的 `debugPort` 只是**上次写入的配置值**，与实际监听状态可能不一致——实测出现过「配置为 9223 但该端口 ECONNREFUSED、浏览器进程根本没跑」的情形，且**运行中途端口还会消失**（浏览器进程仍在、调试端口不再监听），此时 chrome-devtools MCP 报 `Could not connect to Chrome`。因此：
   - 取到端口后必须实测：`node scripts/resolve_midlink.js --check`（等价于 `GET http://127.0.0.1:<port>/json/version` 探活）；
   - 探活失败 → 先按 chrome-devtools 流程拉起（`node <chrome-devtools 技能目录>/localization/start.cjs`，**须在技能目录内执行**），再探活；本技能的 `scripts/check-deps.js` 支持 `--fix-browser` 自动执行「拉起 → 复探」一步到位（以连通性为准，不读配置值即判定成功）；
   - 仍失败 → 记为告警 `browser_unavailable`，检索可继续（走免 Cookie 降级），但**降级链二级（浏览器解析）不可用**，抓取阶段须相应降级并在四栏清单中标注。
4. Cookie 提取后置 `-c` 传给 `search_wechat.js`；**禁止用 `&&` 串联提取与检索**（避免前段失败静默短路掩盖真实搜索行为），须两段式（先取 `CK` 并判 `rc==0 && -n CK`，否则转免 Cookie 降级，详见「检索执行规则」）。
5. ANTI_SPIDER 即停试与会话级终止策略见「检索执行规则 → 退出码 / `ANTI_SPIDER` 判据表」硬约束（F4）。

### 缺失处置

8. 第 1、2 项（硬依赖）缺失时，**先用第 3 条回退基址对缺失项重探一次**，确属缺失则立即停止后续全部操作，输出缺失项清单（须附实际探测到的基址路径，便于核对是否命中虚拟化 HOME），并询问用户是否授权立即安装。未获得明确授权前，禁止自行安装，也禁止继续本轮执行。第 3、4 项（可选依赖）缺失时不阻断，仅记录告警并说明 3 级抓取兜底不可用、已降级运行。

> **代码级强制入口**：上述依赖判定已由 `scripts/check-deps.js` 固化为确定性核查（复用 `resolve_midlink.js` 的 CDP 端口探活与 `state.js` 的 `locateImaApi`），本技能执行检索 / 入库前应先运行 `node scripts/check-deps.js`；硬依赖缺失其退出码为 1，软依赖缺失仅告警并附文档回退。切勿只依赖本散文逐条人工核对。

## 工作流

1. 执行「前置依赖检查」（`node scripts/check-deps.js`）：第 1、2 项（硬依赖）齐全方可继续，否则终止本轮；第 3、4 项（可选）缺失仅告警并降级运行。
2. 读取 `[workspace]` 根目录下的每卡进度文件 `_progress_<card>.json`（A/B/C 各一份）。文件不存在时按「进度文件模板」创建；文件损坏或字段缺失时，按模板重建并将该任务卡的上次运行日期置空、轮转序号置 0。
   2.1 读取项目级记忆文件：检查 `[workspace]/.workbuddy/memory/` 目录，读取其中最新的记忆文件（按文件名时间排序取最新者；若目录不存在或为空，则跳过本次校验，不视为异常）。对读取到的记忆文件执行以下校验：
   - 检查上次运行的任务卡与本次是否一致，若一致则核对上次运行的入库数量与本次是否可衔接（避免同一轮重复入库）；
   - 检查上次运行遗留的临时文件清单，若工区根目录中存在除 `_progress_*.json` 和 `.workbuddy/` 以外的文件，则判定为上次清扫未完成，记录告警并在本轮收尾清扫时一并彻底清除；
   - 若记忆文件中记录了上次未完成的任务卡或限流状态，与进度文件中的对应字段交叉核对，不一致时以进度文件为准并记录差异。
3. 按「任务卡轮转规则」确定本轮执行的任务卡、目标子目录与关键词簇。
4. 对 `[keywords]` 中的每个关键词串行执行检索（优先 `-c` 接口，见「检索执行规则」，**提取与检索须两段式、禁止 `&&` 串联**），捕获检索脚本的退出码与标准错误，按「退出码 / `ANTI_SPIDER` 判据表」分流：退出码 2 立即中止本轮并报告；退出码 1 + 含 `ANTI_SPIDER` 立即终止该关键词本轮（仅记 1 次尝试，不累加 attempts）并据会话级熔断规则判断是否整体终止；退出码 1 无 `ANTI_SPIDER`（网络故障）按限流退避并累加 attempts；退出码 0 且 `total:0` 标记「服务端零收录」并继续下一关键词（不累加 attempts）。每次检索后等待 `[cool_down_seconds]` 秒。对 `url_resolved=true` 的结果直接保留；对 `url_resolved=false` 的结果（搜狗中转链接）**不立即丢弃**，纳入「抓取降级链」由一级 / 二级尝试打开中转链接解析真实内容，最终以「完整性闸门」判定是否入库——取到完整正文则入库，取不到则标记失败并继续，禁止静默丢弃。
5. 对检索结果按标题去重，再按「过滤规则」剔除中标类、开工类、招商类、广告类文章，命中即丢弃且不抓取。
6. 按「抓取降级链」逐篇抓取正文，抓取结果落盘为 Markdown 文件，文件名等于文章标题（替换文件系统非法字符）。每份 Markdown 文件必须在正文前写入元数据头，依次包含：来源公众号、发布时间、作者、原文直链、采集日期，随后为正文。**元数据头格式锁定为下列内联形态，严禁改用 YAML front-matter**（`---` / `title: "…"`）——服务端会把正文首个元数据行当作标题，front-matter 会整块泄漏进条目标题（实测历史条目 5/11 出现 `title: "…` 污染，叠加服务端 30 字符截断后既不可读又导致去重失配）。文件内容格式如下：
   ```
   # {文章标题}
   
   来源：{来源公众号}
   发布时间：{发布时间}
   作者：{作者}
   原文直链：{原文直链}
   采集日期：{采集日期}
   
   {正文}
   ```
   > `原文直链` 一律填**解析后的真实直链**（`mp.weixin.qq.com/s?…`），中转链接未解析成功时填已解码的原链接。
7. 对每份 Markdown 文件执行「完整性闸门」，未通过者标记为失败并跳过，禁止入库。
8. 将通过闸门的文件按「入库流程」逐篇存入 `[knowledge_base_id]` 下 `[folder_id]` 指定的子目录，每篇处理完立即写回进度文件。
9. 执行「复验」，输出**增强四栏清单**（2026-11-05 强化）：必须以 `state.js report` 产出，**不得手工拼凑**。强烈建议带 `--kb-id` / `--folder-id` 走 KB 复核模式：
   ```bash
   node scripts/state.js --progress "[workspace]/_progress_[card].json" report \
     --kb-id "[knowledge_base_id]" --folder-id "[folder_id]" [--ima-api "<ima_api.cjs 路径>"]
   ```
   该清单须包含：① 四栏计数（应入库 / 实入库 / 被过滤 / 失败）；② **被过滤栏**逐条列出标题与命中原因（词族 + 标题层/正文层）；③ **失败栏**逐条列出标题与失败原因（抓取失败 / 闸门未过 / 入库失败）；④ **实入库栏**须为 **KB 复核确认数**（经 `get_knowledge_list` 复核 `media_type===11` 真实存在）、并标注**目标子目录 `folder_id`**；⑤ **应入库但未入库**差额及其根因拆解（失败数 / 幽灵记录数 / 待入库卡死数）；⑥ 若存在**幽灵记录**（进度声称 `ingested` 但 KB 子目录查无此文）须**显式标注**并附 note 明细。未带 KB 参数时 report 降级为离线模式，实入库为进度声称值、幽灵检测不可用——此时须显式告警并提示补 `--kb-id/--folder-id` 复验。
10. 执行「写入项目级记忆」：
    - 生成记忆文件名：`[workspace]/.workbuddy/memory/[YYYY-MM-DD]_[cardId]_r[rotateIndex].md`（若文件不存在则创建，存在则追加）；
    - 内容包含：
      * 本次处理的任务卡 ID、名称、目标子目标识、关键词簇；
      * 检索到的文章总数、去重后数量、过滤掉的数量及原因、完整性闸门未通过数量及原因、入库成功数量、失败数量及原因；
      * 每篇文章的标题、入库状态（成功/失败）、失败原因（如适用）、处理耗时（若可测）；
      * 本轮开始时的进度文件关键字段（上次运行日期、轮转序号等）；
      * 本轮结束时的进度文件关键字段；
      * 任何路径核验异常或依赖缺失情况；
      * 生成时间戳（ISO 8601 格式）。
11. 执行「收尾清扫」：
    - 遍历 `[workspace]` 根目录下的所有条目；
    - 保留以下两项：
      a. `_progress_*.json` 文件（每卡一份）；
      b. `.workbuddy/` 目录及其内部全部内容（隐藏工作区元数据目录）；
    - 删除所有其他文件和目录，但**严禁删除尚未成功入库的本地 `.md` 文章副本**：此类文件须移动到 `[workspace]/failed_quarantine/` 子目录保留（供人工补做或下一轮续跑）；可安全删除的仅限检索结果中间文件（如 `[关键词].json`）、临时日志与其它过程文件；
    - 删除操作必须为彻底删除（不进入回收站），但出于安全考虑，先移动到临时 quarantine 目录再删除，确认无误后清空 quarantine；
    - 清扫完成后输出保留文件清单（含 `_progress_*.json`、`.workbuddy/` 目录，以及 `failed_quarantine/`（若存在））。
12. 按「任务卡轮转规则」更新该卡的上次运行日期、下次到期日与轮转序号。**该步骤的写入必须经 `scripts/state.js update-card` 执行**（F9 唯一入口），示例：
    ```bash
    node scripts/state.js --progress "[workspace]/_progress_A.json" update-card --card A \
      --last-run 2026-11-05 --next-due 2026-11-15 --rotate-index 0 \
      --status completed --note "本轮要点" --pending-keywords "EPC,总包"
    ```
    - `--rotate-index` 传参时按轮转规则在 0 / 1 间切换；未传 `rotate_index`（两簇全搜）时保持不变。
    - 被反爬熔断（F4a）时 `--status antispider_partial`，未检索的关键词写入 `--pending-keywords`，下次重试时刻写入 `--next-retry-at`。
    - `attempts` 仍由 `set-attempts` / `reset-attempts` 单独改写，不得混入本命令。

## 任务卡轮转规则

1. 调用方传入 `[card_id]` 时，直接执行该任务卡；未传入（含零输入调用）时，读取进度文件，在全部任务卡中选择「上次运行日期最早」的一张，上次运行日期为空视为最早。
2. 调用方传入 `[rotate_index]` 时，只检索该序号对应的词簇：0 为主词簇，1 为变体词簇。
3. 调用方未传入 `[rotate_index]` 时（原则上即此情形），不二选一，而是先检索主词簇、再检索变体词簇，两个词簇逐一全搜。
4. 本技能不判断是否应当执行，也不因到期日未到而拒绝执行。是否调用本技能由调度机制决定。
5. 执行完成后更新该卡状态：传入 `[rotate_index]` 时轮转序号在 0 与 1 之间切换；未传入序号（即两簇全搜）时轮转序号保持不变，因为两个词簇本轮均已覆盖。
6. 同时将上次运行日期设为今天，下次到期日设为今天加 `[cycle_days]` 天。
7. 日期一律使用本地日期字符串比较。禁止使用会被转换为协调世界时的日期生成方式，否则在东八区会整体偏移导致日期差一天。

## 断点续跑与续跑守护

本技能的运行由调度方（WorkBuddy / 任一 Agent）编排，关键词检索在技能**外部**（`wechat-article-search` 的 `search_wechat.js`）逐词完成，每词结果再由 `pipeline.js --search` 入库。因此「断点续跑」的全部**可机读信号都必须落在 `_progress_<card>.json`（每卡一份）**，由 `state.js` 承载，调度方据其决策，而非依赖运行日志（改动 B 根治「续跑漏卡」根因）。

### 触发场景（deep-discuss 收敛的边界）
- 场景一：完成某卡**部分关键词**搜索（尚有另一部分关键词未搜），但未下载命中文章、也未入库；
- 场景二：完成部分关键词搜索并下载到本地，但**尚未入库** ima；
- 场景三：完成全部关键词搜索，命中文章**只有部分**下载、部分实际入库；
- 场景四：运行中被限流熔断 / 网络或凭据异常**中断**。

### 调度方必须落地的可机读信号（改动 B·状态机）
- 每完成一个关键词的检索 + 入库，立即 `state.js update-card --searched-keywords "<该关键词>"`（**累积并集**，重复自动去重）；
- 中断 / 部分完成时，写入卡级状态：
  - 瞬时可恢复（限流 / 网络 / 超时）：`--status partial --failure-class transient --next-retry-at <下次重试时刻>`；
  - 永久不可恢复（凭据失效 / 鉴权错误）：`--status interrupted --failure-class permanent`（**不写 `nextRetryAt`**），交人工；守护见到 `failureClass=permanent` 必须**停止续跑并提示用户**，不得反复重试。

### 续跑步骤（守护 / 下一轮照此执行）
1. 读 `_progress_<card>.json`，判定该卡 `status`：
   - `failureClass=permanent`（`interrupted`）→ **停止续跑，提示人工处理凭据**；
   - `partial` / `pending` / `antispider_partial` / `limited` → 进入续跑。
2. `state.js diff-keywords --card <卡> --keywords "<该卡全量关键词（取自任务卡配置表）>"` 取**尚未搜索**的差集，只搜剩余词（已搜词跳过，避免重触发限流）；
3. 对每个新检索结果 JSON 跑 `pipeline.js --search "<x.json>"`；
4. 跑 `pipeline.js --ingest-quarantine --card <卡> --kb-id <kb> --folder-id <folder>`：**消费 `failed_quarantine/` 下未入库的 `.md`，直接补入库而非重搜**（闸门未过的质量失败篇目会被自动跳过，仅重入「闸门通过但入库阶段失败」的篇目）；
5. 全部完成后按「任务卡轮转规则」用 `state.js update-card` 收尾（成功则 `status=completed`；仍有剩余则维持 `partial`）。

> 失败原因分类可用 `state.js classify-failure --reason "..."` 离线判定 `transient` / `permanent`，供调度方统一决策。

## 调用示例（引导词）

> 四套标准引导词（A / B / C 全量采集 + 续跑守护）的完整可复制版见 [`引导词.md`](./引导词.md)。该文件每套引导词均为单段、可独立复制粘贴给任一已加载本技能的 Agent 直接闭环执行；正文此处不再内联复现，避免双源漂移。

## 规则与知识库

### 检索执行规则

- **优先 `-c` 接口（Cookie 绕过会话维反爬）**：调用检索前，先尝试从 wechat-article-search 的脚本目录取得 `weixin.sogou.com` 的 Cookie：`CK=$(node [search_script_dir]/get_sogou_cookie.js 2>/dev/null)`；取得后以 `-c` 传入：`node [search_script_dir]/search_wechat.js "[关键词]" -n [max_results] -r -c "$CK" -o "[workspace]/[关键词].json"`。Cookie 仅缓解**会话维**反爬（antispider 验证码拦截），是本技能与 wechat-article-search 契约的优先路径。
  - **文件名安全化**：`[关键词]` 用于输出文件名前，须将其中的文件系统非法字符（`\ / : * ? " < > |`）替换为下划线，避免 `[workspace]/[关键词].json` 路径畸形。
  - **凭据安全**：Cookie 为会话级凭据，禁止写入进度文件或日志；以命令行参数传入时避免在标准输出/日志中回显 `$CK` 明文。
  - **Cookie 齐全性校验（2026-11-02 实测沉淀）**：提取后先核对关键键齐全（至少含 `SNUID` 与 `SUID`）再传 `-c`；仅访问搜索结果页直提通常只得到访客标识 `SUV`，属残缺 Cookie，直接检索大概率仍被反爬拦截。补救：先在浏览器访问 `weixin.sogou.com` 首页完成一次正常浏览（种全套会话 Cookie），再重新提取。`get_sogou_cookie.js` 检出残缺时以退出码 3 告警（**Cookie 串不再输出**，避免调用方误用残缺串），检索脚本对残缺 `-c` 也会在标准错误给出告警。
  - **提取与检索必须两段式（F5 禁止 `&&` 短路）**：先把 `CK` 存入变量并判定 `rc==0` 且 `CK` 非空，再决定带 `-c` 检索或转免 Cookie 降级；**严禁 `CK=$(...) && search_wechat.js` 串联**——前段失败（退出 2/3）会静默短路，使搜索脚本根本未执行，整体退出码被误显为「搜索 ANTI_SPIDER」。范式：
    ```bash
    CK=$(node [search_script_dir]/get_sogou_cookie.js 2>/dev/null); rc=$?
    if [ $rc -eq 0 ] && [ -n "$CK" ]; then
      node [search_script_dir]/search_wechat.js "[关键词]" -n [max_results] -r -c "$CK" -o "[workspace]/[关键词].json"
    else
      echo "[告警] Cookie 提取失败(rc=$rc)，转免 Cookie 降级检索"; node [search_script_dir]/search_wechat.js "[关键词]" -n [max_results] -r -o "[workspace]/[关键词].json"
    fi
    ```
- **回退（免 Cookie）**：若 `get_sogou_cookie.js` 失败（chrome-devtools 不可用 / 浏览器未开调试端口 / 未取得有效 Cookie），则免 Cookie 调用 `node [search_script_dir]/search_wechat.js "[关键词]" -n [max_results] -r -o "[workspace]/[关键词].json"`（不带 `-c`）；此时命中 antispider 的概率上升，属预期降级，不视为本技能故障，按下方「退出码 / `ANTI_SPIDER` 判据表」进入限流退避。
- 运行检索或抓取脚本时，禁止使用会提前关闭管道的写法（例如把输出管道给只取前若干行的命令）。管道被关闭会中断进程，导致落盘失败、整批结果丢失。应当先重定向到日志文件，再读取日志。
- **退出码 / `ANTI_SPIDER` 判据表**（wechat-article-search 契约，必须据此分流，禁止一律当限流）：

  | 检索脚本退出码 | 标准错误标记 | 含义 | 本技能应对 |
  | --- | --- | --- | --- |
  | 0 | — | 成功，标准输出为 JSON（`total` + `articles`） | 正常解析，进入去重 / 过滤 / 抓取 |
  | 1 | 含 `ANTI_SPIDER` | 会话维反爬触发（验证码拦截） | **立即终止该关键词本轮**（仅记 1 次尝试，**不累加至 `max_attempts`**），转下一关键词；严禁刷新 Cookie 后硬补试（同会话 / IP 已被标记，补试必然再触发 `ANTI_SPIDER`，纯耗配额） |
  | 1 | 无 `ANTI_SPIDER`（网络中断 / 连接重置等） | 请求失败、一篇未取到 | 视为临时网络故障，按退避公式重试；**严禁**把该情形伪装为 `total:0` 空列表（脚本自身已保证失败时不返回空列表） |
  | 2 | — | 参数非法（如 `-n 0` / 非数字 / 未知选项） | 立即中止本轮并报告，属本技能调用姿势错误，须修正 `[search_script_dir]` 与参数后再调用 |

- **会话级反爬熔断（F4 硬约束，2026-11-05 拆分为 F4a / F4b）**：同一执行内若连续 ≥2 个关键词命中 `ANTI_SPIDER`（退出码 1 + 含 `ANTI_SPIDER`），判定「当前出口 IP / 会话已被风控」。**「停止继续检索」与「丢弃已取回的数据」是两个独立决策，必须分开处置**——检索走 `weixin.sogou.com`，抓取走 `mp.weixin.qq.com`，后者不受前者风控影响：
  - **F4a（检索熔断，默认）**：立即**停止继续发起检索请求**（不等候、不空转、不对已被标记会话维反爬的关键词重复硬试），**但保留已取回的检索结果并继续走「去重 → 过滤 → 抓取 → 闸门 → 入库」**。处置：该卡 `status=antispider_partial`，未检索的关键词写入 `pendingKeywords`，`note` 写明已取回量与待补词。
  - **F4b（整体终止）**：仅当**本轮已取回结果数 = 0 且全部关键词均命中 `ANTI_SPIDER`** 时触发——此时无数据可处理，才整体终止本轮。
  > **实测依据（2026-11-05）**：原 F4 把两条语义合并，曾使「第 1 个关键词已成功取回 49 条真实结果、第 2 个词起被反爬」的场景产出归零；而那 49 条中实际有 14 篇完全可入库。按 F4a 处置后同一批数据产出 14 篇。

- **零结果细化（内部判定，对外口径不变）**：检索结束须区分三种零结果——(a) 退出码 1 + 含 `ANTI_SPIDER` → 反爬（**不累加 attempts**，仅记 1 次尝试并转下一关键词，见上方判据表与会话级熔断）；(b) 退出码 1 + 无 `ANTI_SPIDER` → 网络故障（按限流退避，累加 attempts）；(c) 退出码 0 + `total:0` → 服务端确无该关键词收录（**不累加 attempts**，标记「服务端零收录」并继续下一关键词）。对外表述仍统一为「疑似平台限流」（遵循 §边界与限制第 5 条），不得宣称「该主题没有文章」。

### 过滤规则

过滤必须**分层执行**（2026-11-05 实测修正）。原「标题或正文命中下列任一词族即丢弃」的规则在 EPC 等专业主题下误杀率高达 **93%**（实测 29 篇被过滤中 27 篇为误杀），因为「评标」「中标」「开工」「推广」是该领域的高频通用词与政策套话（「评标办法和标准」「招标人与中标人的责任」「大力推广」「可复制、可推广的经验」）。修正后的规则：

**强特征（strong）**——命中即判定为该类公告：

- 中标类：中标公示、中标公告、成交公告、中标候选人、中标候选人名单、开标记录、评标结果公告、评标结果、招标公告、招标编号、中标通知书、预中标公示、中标结果公告、成交通知书、中标金额。
- 开工类：开工仪式、开工典礼、正式开工公告、奠基仪式、破土动工、开工动员。
- 招商类：招商公告、招募令、加盟合作、招商热线、投资招募公告、招商合作。
- 广告类：商务合作、广告投放、赞助合作、带货直播、微信公众号广告、广告合作、商业推广。

**弱特征（weak）**——该词在目标领域属高频通用词，**仅在标题层**、且**上下文模式同时命中**时才拦截：

| 词 | 标题层上下文模式（须同时满足） |
| --- | --- |
| 中标 | `(中标\|预中标)(公告\|公示\|候选人\|结果\|通知书\|候选人名单\|金额)` |
| 开标 | `(开标\|唱标)记录` |
| 开工 | `(正式\|隆重\|顺利\|如期\|集中)?开工(仪式\|典礼\|建设\|启动\|动员)?$` |
| 动工 | `(破土\|正式\|如期)动工` |
| 招募 | `(招募\|招商)(令\|公告\|合作\|计划)` |
| 推广 | `(广告\|商业\|市场)(推广\|投放)` |

**分层判定口径**

1. **标题层**：命中任一强特征即丢弃；命中弱特征且上下文模式同时命中才丢弃。
2. **正文层**：**仅强特征**可拦截，且须**同族命中 ≥ 2 个不同强特征**才丢弃——单次顺带提及不算公告类（如行业报道正文里出现一次「中标公示」不应把整篇丢掉）。
3. **正文层的弱特征一律不拦截**（实测正文层的「评标/中标/推广/开工/动工」命中多为法规原文与政策套话）。
4. **子串边界**：弱特征不得用无边界子串匹配。中文无天然词边界，`动工 ⊂ 推动`、`开工 ⊂ 召开` 会造成纯误判，故弱特征必须走上下文模式而非裸 `includes`。
5. **执行实现**：`scripts/pipeline.js` 的 `matchFilter(text, layer)` 为唯一权威实现；`tests/test_filter_rules.js` 为其回归测试（断言 29 条历史误杀样本全部不再拦截、3 条真命中仍被拦截、11 条子串边界用例全部正确，并给出精确率/召回率指标）。**二者须同步修改，不得只改其一**。

先按标题筛，再按正文复核一次。

### 抓取降级链

> **实装范围（代码级，单一事实源 = `scripts/pipeline.js`）**：0 级（中转链接解析）、1 级（原生网页抓取）、3 级（firecrawl 抓取兜底）已由 `pipeline.js` 实装并自动串联；**2 级（浏览器自动化）为 Agent 手动兜底路径（非代码自动路径）**——当 1 级与 3 级均失败、且确需该篇时，由 Agent 经 chrome-devtools 调试浏览器打开直链提取正文，不在 `pipeline.js` 内自动执行。

0. **零级（前置必做）：中转链接解析**。搜狗结果中 `url_resolved=false` 的条目，其 `url` 为 `weixin.sogou.com/link?url=…` 中转链接，且其中的 `&` 被写作 HTML 实体 `&amp;`——**不解码则 URL 畸形**，直连会被重定向到 `weixin.sogou.com/antispider/`（反爬页），正文永远取不到。必须先经浏览器自动化导航该中转链接、待其 JS 跳转完成后取 `location.href`（`mp.weixin.qq.com/s?…` 形态）作为真实直链。
   - **执行入口**：`scripts/resolve_midlink.js`（零依赖，走 Chrome DevTools HTTP 端点 `/json/new` + `/json/list` + `/json/close`，**不需要 WebSocket、不依赖 chrome-devtools MCP**）。
   - **用法**：单条 `node scripts/resolve_midlink.js "<中转链接>"` → stdout 输出真实直链；批量 `node scripts/resolve_midlink.js --file "<检索结果.json>" [--out "<映射.json>"]`；探活 `node scripts/resolve_midlink.js --check`。
   - **端口**：环境变量 `SOGOU_CDP_PORT`（与 `get_sogou_cookie.js` 同一契约），缺省 9223。
   - 解析失败时以**已解码**的原中转链接直接尝试抓取，最终以「完整性闸门」判定。
   - 检索命令已带 `-r` 且结果 `url_resolved=true` 时已是真实直链，无需本级解析。

1. 一级：使用原生网页抓取能力直接读取真实文章直链，获取标题、来源公众号、作者、发布时间与正文。检索结果中已包含 `title`、`url`、`summary`、`datetime`、`date_text`、`date_description`、`source` 字段，可直接作为元数据头的输入来源。由 `pipeline.js` 的 `fetchArticle()` 实装。
2. 二级（Agent 手动兜底，非代码自动路径）：仅当 1 级与 3 级均失败、且确需该篇时，由 Agent 经 chrome-devtools 调试浏览器打开该直链提取正文。代码层不自动执行本路径——`pipeline.js` 在 1 级与 3 级都失败后标记该篇抓取失败（移入 `failed_quarantine/` 供人工补做），不自动切到浏览器自动化。
3. 三级（代码实装，复用 web-search/firecrawl）：前两级（0/1）失败或返回空时，由 `pipeline.js` 的 `fetchViaFirecrawl()` 复用 `web-search/firecrawl` 适配层封装的官方 `firecrawl` CLI（`firecrawl scrape <URL>`）抓取，密钥优先取 `FIRECRAWL_API_KEY` 环境变量、回退读 `web-search/.env`（与 firecrawl 适配层 `_load_firecrawl_key` 同语义，不回显明文）。**前置可用性由 `check-deps.js` 探测**：`firecrawl` CLI 未安装或 `FIRECRAWL_API_KEY` 缺失则本 tier 标记不可用并直接降级，避免无谓调用；该接口返回限流/错误时立即放弃本 tier，禁止连续硬重试。成功时其输出（markdown）直接作为正文（经「元数据头」包装入库）。
4. 单篇抓取策略：`pipeline.js` 对本篇候选直链先走 0 级解析（如有）+ 1 级原生抓取；1 级失败即尝试 3 级（firecrawl）；3 级不可用或失败则该篇标记抓取失败。不自动整体切换浏览器自动化（2 级），避免单篇偶发就换道或触发反爬。
5. **零级失败不得直接判失败**：须先走一级直连（原中转链接，已解码），再走三级兜底。

### 完整性闸门

每份 Markdown 文件须满足以下判定，否则标记内容不完整（**软硬结合**）：

1. **硬下限（防纯垃圾）**：正文字符数不小于 `[min_chars]`；未达直接判定不完整。
2. **软告警（句号数不再硬拒）**：正文句号数不小于 `[min_periods]` 为理想态；若不足但满足任一**辅助判据**，标记 `periods_low` 交人工复核、**不自动拒**：
   - 正文段落数 ≥ 3；或
   - 含结构化表格或列表 ≥ 2 项；或
   - 标题层级 ≥ 2（存在 `##` 及以上分级）。
3. 句号数不足且**全部辅助判据均不满足**时，才判定为内容不完整（自动拒）。

内容范围补充：文末来源行、免责声明、相关阅读、配图链接缺失，均不判定为不完整。

### 入库流程（笔记入库模式）

> ⚠️ **禁止使用 `import_urls` 接口。** 该接口在知识库中创建的是 URL-书签条目（媒体类型为网页），而非真正的 Markdown 文档。本技能必须将文章以**笔记**形式入库，确保知识库中只存在真正的 Markdown 文件。

入库流程依次为：预检 → 重名检查 → 创建笔记 → 将笔记关联到知识库子目录。

**第一步：预检与重名检查**

在创建笔记前，先做知识库有效性预检，再重名检查：

1. **知识库有效性预检（2026-11-02 实测沉淀）**：调用 `openapi/wiki/v1/get_knowledge_base` 接口（body 传 `{"ids":["[knowledge_base_id]"]}`）确认目标知识库有效。返回业务码非 0 且提示 `invalid or outdated knowledge_base_id` 时（有效格式为 `ima_kb_` 前缀加 8 位字母数字），改调 `openapi/wiki/v1/get_addable_knowledge_base_list`（body 传 `{"cursor":"","limit":50}`）列出本凭据可添加的知识库，从返回 `addable_knowledge_base_list[].id` 取得新标识替换本轮 `[knowledge_base_id]` 取值（仅本轮生效，禁止改写参数配置区默认值）后继续；列表为空或仍失败则终止入库并报告用户。
2. 重名检查与去重（**按媒体类型分流，关键陷阱**）：

   - **文件类（media_type ≠ 11）**：调用 `openapi/wiki/v1/check_repeated_names` 接口，检查目标子目录下是否已存在同名条目（避免重复入库）。须同时满足：① 接口路径带版本前缀（实测有效完整路径为 `openapi/wiki/v1/check_repeated_names`）；② 参数结构为重名参数数组，每项含名称与媒体类型，字段名不可替换；③ 名称必须带 `.md` 扩展名（不带会误判为未重复）。
   - **笔记类（media_type = 11，本技能入库模式）**：`check_repeated_names` **仅适用于文件类型，对笔记会误判「未重复」**，可能造成重复入库。**笔记去重须改用 `openapi/wiki/v1/get_knowledge_list`**：取目标子目录全量条目（`knowledge_base_id` + `folder_id` + `cursor` 空串 + `limit` ≤ 50），以条目 `title` 比对本次待入库标题，命中即跳过。
     > ⚠️ **不可用「整标题精确比对」（2026-11-05 实测修正）**：ima 服务端会把条目 `title` **截断到 30 个字符并追加 `...`**（实测 28 条中 11 条被截断）。故必须用**前缀去重键**：
     > ```js
     > const TITLE_CAP = 30;
     > const dedupKey = (t) => {
     >   let s = String(t ?? '').trim();
     >   s = s.replace(/^title:\s*["']?/, '').replace(/["']?\s*$/, ''); // 剥历史 front-matter 污染
     >   s = s.replace(/\.md$/i, '');                                   // 服务端会剥 .md
     >   s = s.replace(/[.…]+$/, '');                                   // ★ 先剥截断标记再切片
     >   return s.replace(/\s+/g, '').replace(/[！？!？?]/g, '').toLowerCase().slice(0, TITLE_CAP);
     > };
     > ```
     > **★ 关键次序**：必须**先剥除末尾 `...` 再切片**。否则当标题长度恰为 30 时，截断标记落在第 30 字符**之内**，库内标题键会多一个尾点而与原始标题键失配（实测命中 20→22、缺失 6→4）。
     > **★ 不可逆性**：ima 开放接口**无 delete / remove 端点**（端点全量枚举确认），重复入库**不可逆**。故「入库前查重」必须严格，不得先入库再比对。
     > **实现**：`scripts/state.js` 导出 `dedupKey()`，`scripts/pipeline.js` 直接复用，二者不得各写一份。
   - 若去重判定为已存在（文件类 `is_repeated=true` 或笔记类去重键命中），说明该文章已入库，本轮跳过（不重复创建），标记为已去重。

**第二步：创建笔记**

调用笔记模块的 `import_doc` 接口（实测有效完整路径为 `openapi/note/v1/import_doc`），将本地 Markdown 文件内容写入为一篇新笔记：

- `content_format` 固定为 `1`（Markdown）。
- `content` 为本地 `.md` 文件的完整内容（含元数据头与正文）。
- > ⚠️ **`import_doc` 不接受 `folder_id`（2026-11-05 实测）**：传入 `folder_id` 会返回 `code=310001 msg=文件夹不存在`。故**不得传 `folder_id`**——笔记先落在默认位置，再由第三步 `add_knowledge` 关联到目标子目录。
- 接口返回 `note_id`，作为后续关联步骤的唯一标识。

**第三步：将笔记关联到知识库子目录**

调用知识库模块的 `add_knowledge` 接口（实测有效完整路径为 `openapi/wiki/v1/add_knowledge`），将上一步创建的笔记链接到目标知识库的指定子目录：

- `media_type` 固定为 `11`（笔记类型）。
- `note_info.content_id` 传入上一步返回的 `note_id`。
- `title` 使用文章标题（与 `.md` 文件名一致，含 `.md` 扩展名）。**必须显式传 `title`**，不得依赖服务端从正文推导——服务端会把正文首个元数据行当作标题，Markdown 若用 YAML front-matter（`---` / `title: "…"`）会导致**整块 front-matter 被写进标题**（实测历史条目 5/11 出现 `title: "…` 污染，且叠加 30 字符截断后既不可读又导致去重失配）。
- `knowledge_base_id` 传入 `[knowledge_base_id]`。
- `folder_id` 传入 `[folder_id]`（目标子目录标识）。

**第四步：入库复验（2026-11-02 实测新增，2026-11-05 强化）**

关联完成后，调用 `openapi/wiki/v1/get_knowledge_list` 接口（body 传 `knowledge_base_id`、`folder_id`、`cursor` 空串、`limit` 不超过 50）列出目标子目录内容，须命中本次入库条目且其 `media_type` 为 `11`（确为笔记而非 URL 书签）；命中即复验通过。需要进一步核对元数据时，可再调用 `openapi/wiki/v1/get_media_info`（body 传 `{"media_id":"<条目id>"}`）。复验未命中时将该篇标记为失败并计入失败清单，禁止计为成功。

> **复验结果必须回写进度文件，且回写本身带复核**：`state.js mark-ingested` **默认联机复核**该条目 `media_type===11` 真实存在于目标子目录，复核不通过即拒绝写入（2026-11-05 实测修正，见「进度文件写操作纪律」）。禁止以「接口返回 code=0」代替内容核对——历史进度中曾出现声称已入库而 KB 全库查无此文的幽灵记录。
>
> **本轮结算的四栏清单须由 `state.js report --kb-id <kb> --folder-id <folder>` 产出**（KB 复核模式），而非凭运行日志自报。该清单对「实入库」做 KB 逐条复核：进度声称 `ingested` 但 KB 子目录经 `media_id` / 去重键均未命中的条目，**判为幽灵记录并显式标注**（开放接口无删除端点，历史脏数据仅可披露、不能自动修复）。详见步骤 9。

**调用层陷阱警示：`ima_api.cjs` 空响应（2026-11-02 实测沉淀）**

底层执行脚本 `ima_api.cjs` 的 `postJson` **现已校验 HTTP 状态码**：非 2xx（如 404 路径错 / 401 凭据错）会以**退出码 1 + 标准错误 JSON（含 `httpStatus` 与截断 body）** 暴露，不再表现为「退出码 0 且空输出」。遇此直接用 curl 携带 `ima-openapi-clientid` 与 `ima-openapi-apikey` 头对同一接口重放定位（404 查路径前缀、401 查凭据），禁止当成功处理。另：ima-skills 主文档中的 `openapi/list_docs` 为过时示例（实测 404），禁止使用；本节所列完整路径为实测有效口径。

**第四步：入库后清理**

笔记成功关联到知识库后，立即删除本地对应的 `.md` 文件（不在工区保留副本），仅在进度文件中记录入库状态。**口径调和**：本条仅针对「成功入库」的 `.md`；未成功 / 失败的本地 `.md` 一律按「收尾清扫」移入 `failed_quarantine/` 保留，二者不冲突。

### 限流退避

1. 判定为限流后，按当前已尝试次数计算退避秒数，计算公式为 `[cool_down_seconds]` 乘以 2 的「已尝试次数减一」次方，上限为 86400 秒；记录下次重试时刻为当前时刻加该退避秒数，随后将已尝试次数加一。
2. 记录完成后结束本轮，禁止在单次执行中空等数小时。
3. 冷却期间转向处理已取到文章的抓取、入库或复验，不空转。
4. 单篇处理失败最多重试两次并顺带切换降级通道，仍失败则标记失败并继续下一篇，禁止让单篇阻塞整批。
5. 已尝试次数达到 `[max_attempts]`（默认 4）仍为零结果时，**停止继续累加 attempts**（防止无界增长，单次执行内累加至上限即封顶），将该卡标记为「限流终止 / 待下一轮或人工干预」，写入未完成清单，交由下一轮补做；本轮不再对该关键词硬试。
6. 任务卡执行成功并完成时，将该卡已尝试次数重置为 0。
> 断点续跑的可机读信号（状态机）、续跑步骤与隔离区消费，见上方「断点续跑与续跑守护」一节，本节不再重复。

### 进度文件模板

每卡进度文件位于 `[workspace]/_progress_<card>.json`（A/B/C 各一份，下文以 A 卡为例展示单卡文件字段结构；B/C 卡结构相同仅 `name`/`folder_id` 不同），结构如下：

```json
{
  "schema": "1.1",
  "updatedAt": "",
  "cards": {
    "A": {
      "name": "总包",
      "folder_id": "folder_7511772189689986",
      "lastRun": "",
      "nextDue": "",
      "rotateIndex": 0,
      "status": "pending",
      "nextRetryAt": null,
      "attempts": 0,
      "searchedKeywords": [],
      "failureClass": ""
    }
  },
  "articles": []
}
```

### 进度文件写操作纪律（F9 硬约束）

`_progress_<card>.json` 的**任何**写操作（追加 / 修改 `articles` 条目、标记 `ingested` / `failed` / `filtered`、设置 / 重置 `attempts`、更新卡级字段、轮转状态）**必须且只能通过 `scripts/state.js` 执行**，禁止直接手工编辑 JSON。其强约束如下（违反即拒绝写入并报错）：

- `mark-ingested` **默认联机复核**（调 `openapi/wiki/v1/get_knowledge_list` 确认目标条目 `media_type===11` 真实存在于知识库），复核不通过即拒绝写入；仅在显式 `--no-verify` 时跳过（2026-11-05 实测修正：历史进度中曾出现「声称已入库但 KB 全库查无此文」的幽灵记录，成因即 `mark-ingested` 默认不复核）；
- `gate_failed`（闸门未通过）或被标记 `failed` / `filtered` 的条目**严禁**标记为 `ingested`；
- `pending` 与已尝试次数须一致（`attempts` 仅由 `set-attempts` / `reset-attempts` 改写）；
- 每轮结算的四栏清单须由 `state.js report` 产出，不得手工拼凑。
- 解析出的工作区 / 进度目录**严禁落在技能自身目录树内**（R8 防护：`state.js` 与 `pipeline.js` 均内置校验，命中即拒绝写入，防运行产物污染技能仓库；`[WS]` 须指向技能目录之外的独立工作区）。

`state.js` 用法（须在 `wechat-article-to-ima/scripts/` 下以 Node 运行，传入 `--progress <路径>`）：

- `validate`：结构与一致性校验；
- `migrate`：**旧 schema → 新 schema 幂等迁移**（历史进度文件兼容）。旧条目字段为 `cardId` / `status` / `ingested` / `gatePassed` / `filtered`，新条目字段为 `card` / `fetchStatus` / `filterResult` / `gateResult` / `ingestStatus`；不做迁移则 `validate` 直接判非法（2026-11-05 实测修正）。**迁移只改 articles 条目，不动 cards 卡级字段**（`lastRun` / `nextDue` / `attempts` / `pendingKeywords` / `note` 原样保留）；
- `mark-ingested --card C --title T --media-id M [--no-verify] [--ima-api P] [--kb-id K] [--folder-id F]`：标记入库（**默认联机复核** `media_type===11`；需提供 `--ima-api` 与 `--kb-id`，否则报错）；
- `mark-failed --card C --title T --reason R`：标记失败；
- `mark-filtered --card C --title T --reason R`：标记被过滤（写 `filterResult=filtered:<reason>`；**缺失此命令会导致 `report` 的「被过滤」列恒为 0**——`report` 只统计 `filterResult` 以 `filtered` 开头的条目）；
- `set-attempts --card C --n N` / `reset-attempts --card C`：设置 / 重置已尝试次数；
- `reset-card --card C`：清空该卡全部文章记录与卡级累积态（**重跑前重置**，强制全量重搜、解除旧 `failureClass` 锁定；仅清本卡、不动他卡）；**续跑请勿调用本命令**——续跑应保留 `searchedKeywords` 并用 `diff-keywords` 仅搜剩余词，调用本命令会清空已搜词导致全量重搜、重触发限流；
- `update-card --card C [--last-run R] [--next-due D] [--rotate-index I] [--status S] [--next-retry-at T] [--note N] [--pending-keywords K] [--searched-keywords K] [--clear-searched] [--failure-class C]`：更新卡级字段（**步骤 12 轮转规则所需**，缺此命令则 F9 与步骤 12 自相矛盾——卡级字段无法经唯一入口写入）；`--searched-keywords` 为**累积并集**写入已搜词（重复自动去重，支撑定向续跑只搜剩余词）、`--clear-searched` 清空已搜词集合、`--failure-class` 写 `transient` / `permanent` / 空串（清除）；
- `report`：输出增强四栏清单（应入库 / 实入库 / 被过滤 / 失败），被过滤/失败栏含逐条原因，实入库栏含 KB 复核确认数与目标子目录，应入未入含根因拆解，幽灵记录显式标注。支持 `--kb-id <kb> --folder-id <folder>`（KB 复核模式）、`--kb-snapshot <json>`（离线/审计快照）、`--card <卡>`（限定单卡）、`--json`（机器可读）。
- `diff-keywords --card C --keywords "K1;K2;K3"`：给定该卡**全量关键词**（取自「任务卡配置表」），输出**尚未搜索**的差集（续跑时只搜剩余词，避免重触发限流）；支持 `--json`。
- `classify-failure --reason "R"`：依据失败原因判定 `transient`（限流/网络，可重试）或 `permanent`（凭据失效，交人工），返回类别字符串；调度方据其决定是否续跑。

**`articles` 条目 schema（2026-11-05 实测补齐，此前模板未定义导致执行体与脚本各写各的）**：

| 字段 | 类型 | 取值域 | 说明 |
| --- | --- | --- | --- |
| `card` | string | `A` / `B` / `C` | 所属任务卡（历史字段名 `cardId` 由 `migrate` 归一化） |
| `title` | string | 文章标题 | 与 `.md` 文件名一致（不含 `.md`） |
| `fetchStatus` | string | `ok` / `failed` | 正文抓取结果 |
| `filterResult` | string | `kept` / `filtered:<原因>` | 过滤结果（`report` 依此前缀统计被过滤列） |
| `gateResult` | string | `pass` / `fail:<原因>` | 完整性闸门结果（以 `fail` 开头即视为未过闸） |
| `ingestStatus` | string | `pending` / `ingested` / `failed` | 入库状态 |
| `note` | string | 自由文本 | 备注（如 `media_id=…`、失败原因） |

### 技能脚本清单（2026-11-05 新增，可执行实现落点）

| 脚本 | 职责 | 关键约束 |
| --- | --- | --- |
| `scripts/state.js` | `_progress_<card>.json` 唯一读写入口（F9） | 导出 `dedupKey()` / `TITLE_CAP` / `locateImaApi()` / `classifyReport()` / `classifyFailure()`，供流水线复用；`report` 子命令产出增强四栏清单（KB 复核 + 幽灵记录标注 + 逐条原因）；`diff-keywords` 输出未搜词差集、`classify-failure` 判定 transient/permanent；**不得**由其他脚本另写一份去重键或路径解析 |
| `scripts/check-deps.js` | 前置依赖**代码级**核查器（硬依赖阻断、软依赖告警） | 复用 `resolve_midlink.js` 的 `checkBrowser` 与 `state.js` 的 `locateImaApi`；解析并输出 `search_script_dir` / `ima_api` 路径 / `cdp_port`；硬依赖缺失退出码 1，软依赖缺失仅告警 |
| `scripts/resolve_midlink.js` | 中转链接 → 真实直链（降级链零级） | 走 Chrome DevTools HTTP 端点，**不依赖 MCP、不依赖 WebSocket**；`--check` 为端口探活 |
| `scripts/pipeline.js` | 抓取 → 过滤 → 闸门 → 入库 → 状态回写 全流水线 | 过滤规则以 `matchFilter(text, layer)` 为唯一实现；ima 调用经 `ima_api.cjs` 的**模块导出**（规避长正文 CLI 参数长度上限）；`--ingest-quarantine` 模式消费 `failed_quarantine/` 未入库 `.md` 直接补入库而不重搜（改动 B·③） |
| `scripts/test_filter_rules.js` | 过滤规则回归测试 | 断言 29 条历史误杀样本不再拦截 + 3 条真命中仍拦截 + 11 条子串边界用例 |
| `scripts/deploy.js` | 开发态 → 部署态 一键同步（零依赖） | 走 `git cat-file blob` 逐字节重建（**不经工作树**，避免 `core.autocrlf` 带入 CRLF，§7.3）；`ima_credentials.json` 为部署态专有物，保留不覆盖；`--dry-run` 预演、`--ref main` 指定来源引用 |

### 测试资产（`tests/`，2026-11-05 补齐）

> 全部为**可复用测试脚本**（§8.3⑤ 允许入库），零第三方依赖、不反向依赖仓库级入口、临时文件自清理。
> 真实态用例默认跳过，须 `--allow-real` 显式门控（§9.3）。

| 脚本 | 类型 | 覆盖内容 |
| --- | --- | --- |
| `tests/test_filter_rules.js` | 回归（离线） | 过滤规则逐条断言 + 精确率/召回率指标；样本 `tests/fixtures/filter_false_positives.json` |
| `tests/test_state.js` | 回归（离线） | `state.js` 全子命令（validate/migrate/mark-*/update-card/reset-*/report）+ 强约束 + `dedupKey` 语义 |
| `tests/test_pipeline_contract.js` | 回归（离线） | 响应解析层、过滤分层语义、闸门辅助判据、元数据头内联形态、文件名安全化、CLI 契约 |
| `tests/test_fetch_failure_taxonomy.js` | 回归（离线）+ 真实态 | 抓取失败五类归因分类器（样本 `tests/fixtures/fetch_response_samples.json`）+ `url_resolved` 交叉表 |
| `tests/test_kb_consistency.js` | 回归（离线）+ 真实态 | ima 库五维一致性审计（重复条目 / front-matter 污染 / 截断 / 非笔记媒体类型 / 幽灵记录 / 孤儿条目；样本 `tests/fixtures/kb_snapshot_sample.json`） |

## 输出格式约束

1. 使用简体中文输出，结构为表格或分节列表，不使用修饰性客套话。
2. 结束时必须输出四栏清单（由 `node scripts/state.js --progress <p> report [--kb-id K] [--folder-id F]` 产出，不得手工拼凑）：① 应入库数量；② 实入库数量（**须为 KB 复核确认数**，并注明目标子目录 `folder_id`）；③ 被过滤数量与**逐条原因**（命中词族 + 标题层/正文层）；④ 失败数量与**逐条原因**（抓取失败 / 闸门未过 / 入库失败）。若存在**幽灵记录**（进度声称已入库但 KB 查无），须显式标注并提供 note 明细。
3. 被限流终止的任务卡必须单独点名，并给出下次重试时刻。
4. 每份 Markdown 文件的正文前须包含来源公众号、发布时间、作者、原文直链与采集日期。

## 收尾清扫

1. 工区保留：每卡进度文件 `_progress_*.json`、工作区元数据目录 `.workbuddy/`；此外**必须保留尚未成功入库的本地 `.md` 文章副本**（移至 `failed_quarantine/` 子目录，禁止随过程文件一并删除，避免内容不可逆丢失）。（与「入库流程」步骤 4 一致：仅「成功入库」的 `.md` 删除，未成功者在此保留。）
2. 可清除：检索结果中间文件（如 `[关键词].json`）、临时日志与其余过程文件；清除须先移至临时 quarantine 再彻底删除。
3. Markdown 文件成功入库后不在工区保留副本（由「入库流程」步骤 4 删除）。
4. 清扫完成后输出保留文件清单。

## 示例

### 示例一：正常场景（零输入调用）

输入：无任何参数传入。

输出：前置依赖检查四项全部具备；进度文件存在且三张卡上次运行日期均为空，按轮转规则选择 A 卡；因未传入轮转序号，主词簇（工程总承包、EPC、总包）与变体词簇（总承包EPC、EPC总承包）逐一全搜，目标子目录为 folder_7511772189689986。检索到 12 篇，去重后 10 篇，过滤剔除 2 篇开工类，抓取成功 8 篇，闸门全部通过，入库 8 篇，复验列表条目数 8 且目标子目录（folder_id）标识正确。四栏清单为「应入库 8 / 实入库 8 / 被过滤 2 / 失败 0」。执行完成后 A 卡上次运行日期设为今天、下次到期日设为今天加 10 天；因两簇均已覆盖，轮转序号保持 0 不变。

### 示例二：边界场景（指定任务卡且命中变体轮次）

输入：`card_id` 为 B，且显式传入 `rotate_index` 为 1。

输出：直接执行 B 卡，只检索序号 1 对应的变体词簇（有机更新、微更新、城市双修、小区整治、城中村更新、街区整治、街区打造、社区整治、社区打造、基础设施更新），目标子目录为 folder_7512040100861636。执行完成后 B 卡轮转序号由 1 切换为 0，下次到期日设为今天加 10 天。

### 示例三：异常场景（平台限流）

输入：`card_id` 为 A，检索返回零条结果，进度文件中 A 的已尝试次数为 1。

输出：按公式计算退避秒数为 120 乘以 2 的 0 次方，即 120 秒；将 A 卡状态置为限流，下次重试时刻设为当前时刻加 120 秒，已尝试次数由 1 加一变为 2；输出「本轮判定为平台限流，已记录下次重试时刻，结束本轮」，并说明剩余未完成关键词将交由下一轮补做。不执行任何抓取与入库动作。

## 边界与限制

1. 禁止改写、摘要化或润色文章内容，抓到什么就存什么。
2. 禁止新建知识库，禁止写入调用方指定子目录以外的位置。
3. 禁止将密钥、令牌等凭据写入进度文件、日志或任何交付产物。
4. 单次执行中空等数小时属于禁止行为，应当记录状态后结束本轮。
5. 检索结果为空时禁止对外宣称「该主题没有文章」，只能表述为疑似平台限流。
6. 复验不通过时必须如实报出差异条目，禁止以接口返回成功代替内容核对。
7. 遇到参数缺失、目录标识不明确或结果无法判定的情况，应当停止并询问调用方，不自行扩大执行范围。
8. 本技能不制定调度策略，也不因到期日未到而拒绝执行；是否调用本技能由调度机制决定。
