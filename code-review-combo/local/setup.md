# 本地增强：自动安装 ocr CLI 与 Win11 PATH 处理

> 本文件属于 `code-review-combo` 的本地化增强，已从上游镜像 `open-code-review-delegate/SKILL.md`（上游 v1.9.5 纯镜像）中抽离至此。
> 仅在使用 `open-code-review-delegate` 技能时作为补充指引，不修改上游内容。

## 1. 前置检查

每次启动技能先确认 `ocr` CLI 是否存在：

```bash
# 1. 检查 CLI 是否已安装
which ocr || echo "NOT INSTALLED"
npx @alibaba-group/open-code-review --version
```

## 2. 自动安装（视为常规设置步骤，无需询问用户）

若检测为 `NOT INSTALLED`，直接执行安装。**不要向用户二次确认**，这是技能运行所需的环境准备：

```bash
npm install -g --allow-scripts=@alibaba-group/open-code-review @alibaba-group/open-code-review
```

若当前环境为 Windows 11 的 CMD / PowerShell，仍用同一命令（npm 全局安装会写入 Node 的全局 bin 目录）：

```powershell
npm install -g --allow-scripts=@alibaba-group/open-code-review @alibaba-group/open-code-review
```

安装后务必再做一次环境确认：

```bash
npx @alibaba-group/open-code-review --version
```

## 3. Win11 PATH 处理（关键）

Windows 11 下，npm 全局安装后 `ocr` 位于 Node 全局 bin 目录，但**当前 shell 的 PATH 往往未包含该目录**，导致 `ocr` 命令找不到。处理方式：

1. 用 `npm root -g` 取得 Node 全局安装根目录（例如 `D:\Tools\Assembly\nodejs\node_global`）。
2. 全局 bin 目录通常是其同级的 `node_global` 或 `node_global\node_modules\.bin`；常见完整路径形如：
   - `D:\Tools\Assembly\nodejs\node_global`
   - `D:\Tools\Assembly\nodejs`（Node 本体所在目录，也应一并加入）
3. 在调用 `ocr` 之前，把上述目录临时追加到 PATH：

```bash
export PATH="$PATH:/d/Tools/Assembly/nodejs/node_global:/d/Tools/Assembly/nodejs"
```

> 注：上述路径为示例，实际以本机 `npm root -g` 输出为准。建议在 shell 配置（如 `.bashrc` / `$PROFILE`）中持久加入，避免每次手动 export。

## 4. LLM 连通性（仅当使用 review / scan 时才需要）

委托模式（delegate）**完全不需要 LLM**；只有在切换到 OCR 原生 `review` / `scan` 时才需配置 LLM。配置前先验证连通性：

```bash
ocr llm test
```

若 `ocr llm test` 失败，**严禁编造或硬编码任何 API Key**，应停下并向用户展示以下两种方式后等待其选择：

- 方式 A（环境变量，优先级最高，适合 CI）：
  ```bash
  export OCR_LLM_URL=https://api.anthropic.com/v1/messages
  export OCR_LLM_TOKEN=<api-key>
  export OCR_LLM_MODEL=claude-opus-4-6
  export OCR_USE_ANTHROPIC=true
  ```
- 方式 B（持久配置）：
  ```bash
  ocr config set llm.url https://api.anthropic.com/v1/messages
  ocr config set llm.auth_token <api-key>
  ocr config set llm.model claude-opus-4-6
  ocr config set llm.use_anthropic true
  ```

## 5. 硬约束说明（与 git 安全相关）

- **绝不把真实 Key 写进任何 git 跟踪文件**。LLM Token 只经环境变量或 `ocr config set` 进入本地配置；不要在脚本、`SKILL.md`、`*.md` 中写入明文 Key。
- 若项目存在 `config/providers.json`，该文件已被 `.gitignore` 忽略——**不要改动它、不要提交它**。需要参考结构时请看 `config/providers.example.json`。
- 本文件（及 `local/` 下其他文件）本身不承载任何密钥，可安全提交。
- 不要对仓库执行 `git commit`；统一由主 Agent 收尾。
