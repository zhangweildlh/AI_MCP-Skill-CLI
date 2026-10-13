# 推送通道判诊、退出码陷阱与检索词法（2026-10-01 / 10-03 实证）

> 本文件汇总三组高频踩坑：①推送失败先分「网络层 vs 认证层」再决定行为；②Bash 管道退出码陷阱（假绿家族的典型形态）；③`gh search` 词法与同名镜像仓库识别。每条均附实测判据，可直接照做。

---

## 一、推送通道分层判诊

### 1.1 现象与分层

`git push` 报 `Failed to connect to <host>:443` / `Recv failure: Connection was reset` 时，**必须先分层再重试**：

| 层级 | 判据（错误文本特征） | 处置 |
|---|---|---|
| **网络 / 传输层** | `Could not connect` / `Connection reset` / `Connection timed out` | 测端口；**持续性**阻断则停手等恢复，**间歇性**抖动则退避重试 |
| **认证 / 授权层** | `403` / `401` / `permission denied` / `Authentication failed` | 查凭据与 scope（`gh auth status`、`git remote -v`） |
| **本地错误** | `Permission denied (publickey)` / `pathspec` / `nothing to commit` | 本地配置或操作错误，与网络无关 |

### 1.2 双通路独立探测（关键：`gh` 通不代表 `git` 通）

```bash
gh api user --jq .login                              # gh 通路（能返回账号名 = API 通）
git ls-remote --exit-code --heads origin refs/heads/<分支>   # git 通路单独试
```

**硬禁忌**：**禁止**用 `gh auth status` 有无输出判断网络通 —— 它只证明**本地缓存的凭据有效**，与 HTTPS 通道是否可达无关。

### 1.3 端口级连通性判据（唯一可靠的端口判据）

```powershell
Test-NetConnection -ComputerName github.com -Port 443 -WarningAction SilentlyContinue |
  Select-Object TcpTestSucceeded, PingSucceeded, RemoteAddress
```

判读矩阵：

| PingSucceeded | TcpTestSucceeded | 结论 |
|---|---|---|
| True | **True** | 端口通 |
| True | **False** | **传输层阻断**——用 Ping 判断可达性会得出错误结论 |
| False | False | DNS 或网络不可达 |

### 1.4 持续阻断 vs 间歇抖动（重要修正）

- **持续性阻断**（`TcpTestSucceeded=False` 持续）→ 停手等网络/策略恢复，重试无意义。
- **间歇性抖动**（同一形态曾出现「失败 → 退避 → 成功」）→ **继续退避重试是有效的**，不可沿用上一条结论。

两步判据须合用：先分层 → 确认非稳定阻断 → 退避重试（且每次只认命令自身退出码）。

---

## 二、Bash 管道退出码陷阱（假绿家族）

### 2.1 机理

`cmd | tail -N` 的退出码取的是**管道最后一个命令**（`tail`）的。`git push` 失败而 `tail` 成功 → 整体退出码 0 → 脚本判定成功。

实测后果：连续 5 次推送全部失败，重试脚本却打印 `PUSH_OK`。

### 2.2 三条正确写法

```bash
# ① 判成功：命令自身退出码
if git push -u origin <分支> >/tmp/push.log 2>&1; then echo PUSH_OK; else echo PUSH_FAIL; tail -3 /tmp/push.log; fi

# ② 保留管道时取左半段
git push -u origin <分支> | tail -3
rc=${PIPESTATUS[0]}        # ✅ 取左边；$? 是 tail 的，❌ 不能用

# ③ 重试循环（推荐）
for i in 1 2 3; do
  if git push -u origin <分支> >/tmp/push.log 2>&1; then echo OK; break
  else tail -3 /tmp/push.log; sleep 5; fi
done
```

### 2.3 假绿家族的三种形态（同类错误，识别后一并按失败处理）

1. **管道退出码**：`cmd | tail` 掩盖失败。
2. **子进程缺席判 SKIP**：检查项因脚本找不到而SKIP，看着通过其实什么都没查 → SKIP 与 FATAL 一律按失败处理。
3. **匹配 0 项**：检查判据在目标上匹配 0 行（异构格式），易被读作「无问题」→ 0 匹配必须判 FAIL。

**统一判据**：凡「看起来通过」但无实际检查内容输出者，一律判失败；只有明确输出了检查内容的「通过」才算数。

---

## 三、`gh search` 词法与同名镜像识别

### 3.1 词法：长句 = 0 结果

实测同一批检索需求，多词英文长句（`wechat article full text extract` 之类）**全部返回空**；换成 2–4 词短词（专有名词 / 技能名）立刻出结果。

**规则**：先上最稳的 1–2 个**专有名词**（仓库常见名 / 技能名），再上语义短词；**不要一上来拼英文长句**。

**私有仓库信号**：`gh search code` 命中私有仓库时 `repository` 字段为 `null` —— 这是「你无权访问」，**不是「不存在」**。

### 3.2 同名 ≠ 同源：还原血缘四步法

`gh search repos` 按名字匹配，同名仓库可能来自完全不同的作者与分支。实测同一技能名出现「268★ 停更镜像」与「零依赖本地改良版 v0.1.1」并存 —— **只看 star 数会直接判反**。

```bash
# ① 元信息
gh api repos/<owner>/<repo> --jq '"stars=\(.stargazers_count) pushed=\(.pushed_at) license=\(.license.name) archived=\(.archived)"'
# ② 提交历史：活着的工程 vs 一次性生成的镜像
gh api repos/<owner>/<repo>/commits --jq '.[] | "\(.commit.author.date) \(.commit.message|split("\n")[0])"' | head -5
# ③ 是否生成式镜像
gh api repos/<owner>/<repo>/contents/SOURCE.json --jq '.content' | base64 -d | head -20
# ④ 正文比对（最关键）：与本地做 diff
gh api repos/<owner>/<repo>/contents/<skillDir>/SKILL.md --jq '.content' | base64 -d > _upstream.md
diff -u ~/.workbuddy/skills/<name>/SKILL.md _upstream.md
```

**判读要点**：
- 提交个位数且信息含 `generated mirror` / `sync canonical payload` → **镜像仓库，star 虚高，价值低**；`SOURCE.json` 里的 `canonical_repository` 才是真源。
- 上游强制 `npm install -g xxx` 而本地写「零第三方依赖」→ **本地是改良版，不要换**。
- 提交只有个位数且带 `convert to generated mirror` → 自动生成导出镜像，非开发主体。

### 3.3 候选可用性五维打分（每维须有硬证据）

| 维度 | 怎么查 |
|---|---|
| 许可 | `license=` 是否 null（null = 不能放心自用/改） |
| 活跃度 | `pushed_at` 距今；> 3 个月未动 = 停更 |
| 依赖成本 | 是否要求全局装包 / 申请付费第三方 API Key |
| 外部对抗 | 是否外包给付费代理 |
| 用户侧成本 | 是否需扫码登录、登录态是否跨会话持久化 |

**「更专业」≠「更稳定」**：需付费 API Key 的方案即使功能更强，也不等于更可用。

---

## 四、无 `.git` 本地副本与上游的版本锁定（`hash-object` 三步法）

**适用**：本地是从 Release / zip 解压的副本，无 `.git`，无法 `git log` / `describe`；README 里的版本号不可信（实测 README 标 v0.9.0、实际二进制 v0.13.4）。

```bash
ls -d "<副本>/.git" || echo "确认：非 git 仓库"
cd "<副本>" && git hash-object <关键文件1>        # 本地 blob sha，不需要仓库
gh api "repos/<owner>/<repo>/contents/<关键文件1>" --jq .sha   # 上游 blob sha
```

**判据**：两侧字符串**逐字节相等** ⇒ 本地副本 == 上游该 ref 的该文件。**取 2 个以上不同模块的文件交叉验证**，避免单文件巧合。

**禁忌**：
- 不用 README / CHANGELOG 的版本声明当事实源；
- 不用「目录结构看起来像」当证据；
- 不把 `gh api` 返回的 `sha` 当 commit sha（它是 **blob sha**，语义不同）；
- 上游同一路径有多分支时须显式 `?ref=<branch/tag>`，否则默认取 default branch。

**Git Bash 误报排雷**：`git -C /d/...`（Unix 风格根路径）会误报 `fatal: not a git repository`；一律用 `D:/...` 盘符写法或先 `cd`。

---

## 五、文档命令跨 shell 可跑性 + 长任务验证隔离

### 5.1 正斜杠三端通用

**反斜杠**在 cmd/PowerShell 是目录分隔符，在 Git Bash 是**转义符** —— `\s` 得到字面 `s`，会把 `tools-zw\status.py` 粘成 `tools-zwstatus.py`。写进文档的路径**一律用正斜杠**，cmd / PowerShell / Git Bash 三处都能原样跑。

**相对路径**（如 `--project .`）会把「必须在某目录下执行」的隐形前提转移给读者，换目录即失效。

### 5.2 长任务验证须加超时 + 后台隔离

「只读」脚本仍可能真发网络请求，耗时数分钟。无超时护栏时，验证会退化成「等待 → 怀疑 → 反复排查」。凡预估超过 1 分钟的验证，一律后台化或加超时，并先用最小样本试探。

### 5.3 调度入口须审查被调脚本的凭证输出

把子脚本纳入主控统一调度（`--tool` / `run_tool`）时，**验收标准不能只验「能不能调通」**，必须同步审查「调出来的输出里有没有明文凭证」 —— 历史调试残留的 `print(key)` 会顺着新入口直接暴露到控制台/日志。高危等级，等同凭证泄露。