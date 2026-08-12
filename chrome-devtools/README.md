# Chrome DevTools for agents

[![npm chrome-devtools-mcp package](https://img.shields.io/npm/v/chrome-devtools-mcp.svg)](https://npmjs.org/package/chrome-devtools-mcp)

Chrome DevTools for agents (`chrome-devtools-mcp`) lets your coding agent (such as Antigravity, Claude, Cursor or Copilot)
control and inspect a live Chrome browser. It acts as a Model-Context-Protocol
(MCP) server, giving your AI coding assistant access to the full power of
Chrome DevTools for reliable automation, in-depth debugging, and performance analysis.
A [CLI](docs/cli.md) is also provided for use without MCP.

## [Tool reference](./docs/tool-reference.md) | [Changelog](./CHANGELOG.md) | [Contributing](./CONTRIBUTING.md) | [Troubleshooting](./docs/troubleshooting.md) | [Design Principles](./docs/design-principles.md)

## Key features

- **Get performance insights**: Uses [Chrome
  DevTools](https://github.com/ChromeDevTools/devtools-frontend) to record
  traces and extract actionable performance insights.
- **Advanced browser debugging**: Analyze network requests, take screenshots and
  check browser console messages (with source-mapped stack traces).
- **Reliable automation**. Uses
  [puppeteer](https://github.com/puppeteer/puppeteer) to automate actions in
  Chrome and automatically wait for action results.

## Disclaimers

`chrome-devtools-mcp` exposes content of the browser instance to the MCP clients
allowing them to inspect, debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you don't want to share with
MCP clients.

`chrome-devtools-mcp` officially supports Google Chrome and [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/) only.
Other Chromium-based browsers may work, but this is not guaranteed, and you may encounter unexpected behavior. Use at your own discretion.
We are committed to providing fixes and support for the latest version of [Extended Stable Chrome](https://chromiumdash.appspot.com/schedule).

Performance tools may send trace URLs to the Google CrUX API to fetch real-user
experience data. This helps provide a holistic performance picture by
presenting field data alongside lab data. This data is collected by the [Chrome
User Experience Report (CrUX)](https://developer.chrome.com/docs/crux). To disable
this, run with the `--no-performance-crux` flag.

## **Usage statistics**

Google collects usage statistics (such as tool invocation success rates, latency, and environment information) to improve the reliability and performance of Chrome DevTools MCP.

Data collection is **enabled by default**. You can opt-out by passing the `--no-usage-statistics` flag when starting the server:

```json
"args": ["-y", "chrome-devtools-mcp@latest", "--no-usage-statistics"]
```

Google handles this data in accordance with the [Google Privacy Policy](https://policies.google.com/privacy).

Google's collection of usage statistics for Chrome DevTools MCP is independent from the Chrome browser's usage statistics. Opting out of Chrome metrics does not automatically opt you out of this tool, and vice-versa.

Collection is disabled if `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` or `CI` env variables are set.

## Update checks

By default, the server periodically checks the npm registry for updates and logs a notification when a newer version is available.
You can disable these update checks by setting the `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` environment variable.

## Requirements

- [Node.js](https://nodejs.org/) [LTS](https://github.com/nodejs/Release#release-schedule) version.
- [Chrome](https://www.google.com/chrome/) current stable version or newer.
- [npm](https://www.npmjs.com/)

## Getting started

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

> [!NOTE]
> Using `chrome-devtools-mcp@latest` ensures that your MCP client will always use the latest version of the Chrome DevTools MCP server.

If you are interested in doing only basic browser tasks, use the `--slim` mode:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--slim", "--headless"]
    }
  }
}
```

See [Slim tool reference](./docs/slim-tool-reference.md).

### MCP Client configuration

<details>
  <summary>Amp</summary>
  Follow https://ampcode.com/manual#mcp and use the config provided above. You can also install the Chrome DevTools MCP server using the CLI:

```bash
amp mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Antigravity</summary>

To use the Chrome DevTools MCP server follow the instructions from <a href="https://antigravity.google/docs/mcp">Antigravity's docs</a> to install a custom MCP server. Add the following config to the MCP servers config:

```bash
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

This will make the Chrome DevTools MCP server automatically connect to the browser that Antigravity is using. If you are not using port 9222, make sure to adjust accordingly.

Chrome DevTools MCP will not start the browser instance automatically using this approach because the Chrome DevTools MCP server connects to Antigravity's built-in browser. If the browser is not already running, you have to start it first by clicking the Chrome icon at the top right corner.

</details>

<details>
  <summary>Claude Code</summary>

**Install via CLI (MCP only)**

Use the Claude Code CLI to add the Chrome DevTools MCP server (<a href="https://code.claude.com/docs/en/mcp">guide</a>):

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

**Install as a Plugin (MCP + Skills)**

> [!NOTE]
> If you already had Chrome DevTools MCP installed previously for Claude Code, make sure to remove it first from your installation and configuration files.

To install Chrome DevTools MCP with skills, add the marketplace registry in Claude Code:

```sh
/plugin marketplace add ChromeDevTools/chrome-devtools-mcp
```

Then, install the plugin:

```sh
/plugin install chrome-devtools-mcp@chrome-devtools-plugins
```

Restart Claude Code to have the MCP server and skills load (check with `/skills`).

> [!TIP]
> If the plugin installation fails with a `Failed to clone repository` error (e.g., HTTPS connectivity issues behind a corporate firewall), see the [troubleshooting guide](./docs/troubleshooting.md#claude-code-plugin-installation-fails-with-failed-to-clone-repository) for workarounds, or use the CLI installation method above instead.

</details>

<details>
  <summary>Cline</summary>
  Follow https://docs.cline.bot/mcp/configuring-mcp-servers and use the config provided above.
</details>

<details>
  <summary>Codex</summary>
  Follow the <a href="https://developers.openai.com/codex/mcp/#configure-with-the-cli">configure MCP guide</a>
  using the standard config from above. You can also install the Chrome DevTools MCP server using the Codex CLI:

```bash
codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

**On Windows 11**

Configure the Chrome install location and increase the startup timeout by updating `.codex/config.toml` and adding the following `env` and `startup_timeout_ms` parameters:

```
[mcp_servers.chrome-devtools]
command = "cmd"
args = [
    "/c",
    "npx",
    "-y",
    "chrome-devtools-mcp@latest",
]
env = { SystemRoot="C:\\Windows", PROGRAMFILES="C:\\Program Files" }
startup_timeout_ms = 20_000
```

</details>

<details>
  <summary>Command Code</summary>

Use the Command Code CLI to add the Chrome DevTools MCP server (<a href="https://commandcode.ai/docs/mcp">MCP guide</a>):

```bash
cmd mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Copilot CLI</summary>

Start Copilot CLI:

```
copilot
```

Start the dialog to add a new MCP server by running:

```
/mcp add
```

Configure the following fields and press `CTRL+S` to save the configuration:

- **Server name:** `chrome-devtools`
- **Server Type:** `[1] Local`
- **Command:** `npx -y chrome-devtools-mcp@latest`

</details>

<details>
  <summary>Copilot / VS Code</summary>

**Install as a Plugin (Recommended)**

The easiest way to get up and running is to install `chrome-devtools-mcp` as an agent plugin.
This bundles the **MCP server** and all **skills** together, so your agent gets both the tools
and the expert guidance it needs to use them effectively.

1.  Open the **Command Palette** (`Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux).
2.  Search for and run the **Chat: Install Plugin From Source** command.
3.  Paste in our repository name: `ChromeDevTools/chrome-devtools-mcp`.

That's it! Your agent is now supercharged with Chrome DevTools capabilities.

---

**Install as an MCP Server (MCP only)**

**Click the button to install:**

[<img src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Server&color=0098FF" alt="Install in VS Code">](https://vscode.dev/redirect/mcp/install?name=io.github.ChromeDevTools%2Fchrome-devtools-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22chrome-devtools-mcp%22%5D%2C%22env%22%3A%7B%7D%7D)

[<img src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Server&color=24bfa5" alt="Install in VS Code Insiders">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522io.github.ChromeDevTools%252Fchrome-devtools-mcp%2522%252C%2522config%2522%253A%257B%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522chrome-devtools-mcp%2522%255D%252C%2522env%2522%253A%257B%257D%257D%257D)

**Or install manually:**

Follow the VS Code [MCP configuration guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server) using the standard config from above, or use the CLI:

For macOS and Linux:

```bash
code --add-mcp '{"name":"io.github.ChromeDevTools/chrome-devtools-mcp","command":"npx","args":["-y","chrome-devtools-mcp"],"env":{}}'
```

For Windows (PowerShell):

```powershell
code --add-mcp '{"""name""":"""io.github.ChromeDevTools/chrome-devtools-mcp""","""command""":"""npx""","""args""":["""-y""","""chrome-devtools-mcp"""]}'
```

</details>

<details>
  <summary>Cursor</summary>

**Click the button to install:**

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=chrome-devtools&config=eyJjb21tYW5kIjoibnB4IC15IGNocm9tZS1kZXZ0b29scy1tY3BAbGF0ZXN0In0%3D)

**Or install manually:**

Go to `Cursor Settings` -> `MCP` -> `New MCP Server`. Use the config provided above.

</details>

<details>
  <summary>Devin CLI</summary>

**Install via CLI (MCP only)**

Use the Devin CLI to add the Chrome DevTools MCP server (<a href="https://docs.devin.ai/cli/extensibility/mcp/configuration">guide</a>):

```bash
devin mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Factory CLI</summary>
Use the Factory CLI to add the Chrome DevTools MCP server (<a href="https://docs.factory.ai/cli/configuration/mcp">guide</a>):

```bash
droid mcp add chrome-devtools "npx -y chrome-devtools-mcp@latest"
```

</details>

<details>
  <summary>Gemini CLI</summary>
Install the Chrome DevTools MCP server using the Gemini CLI.

**Project wide:**

```bash
# Either MCP only:
gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest
# Or as a Gemini extension (MCP+Skills):
gemini extensions install --auto-update https://github.com/ChromeDevTools/chrome-devtools-mcp
```

**Globally:**

```bash
gemini mcp add -s user chrome-devtools npx chrome-devtools-mcp@latest
```

Alternatively, follow the <a href="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-set-up-your-mcp-server">MCP guide</a> and use the standard config from above.

</details>

<details>
  <summary>Gemini Code Assist</summary>
  Follow the <a href="https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers">configure MCP guide</a>
  using the standard config from above.
</details>

<details>
  <summary>Grok Build CLI</summary>

```bash
grok mcp add chrome-devtools npx chrome-devtools-mcp@latest
```

See the <a href="https://docs.x.ai/build/features/skills-plugins-marketplaces">docs</a> for more options
</details>

<details>
  <summary>JetBrains AI Assistant & Junie</summary>

Go to `Settings | Tools | AI Assistant | Model Context Protocol (MCP)` -> `Add`. Use the config provided above.
The same way chrome-devtools-mcp can be configured for JetBrains Junie in `Settings | Tools | Junie | MCP Settings` -> `Add`. Use the config provided above.

</details>

<details>
  <summary>Kiro</summary>

In **Kiro Settings**, go to `Configure MCP` > `Open Workspace or User MCP Config` > Use the configuration snippet provided above.

Or, from the IDE **Activity Bar** > `Kiro` > `MCP Servers` > `Click Open MCP Config`. Use the configuration snippet provided above.

</details>

<details>
  <summary>Katalon Studio</summary>

The Chrome DevTools MCP server can be used with <a href="https://docs.katalon.com/katalon-studio/studioassist/mcp-servers/setting-up-chrome-devtools-mcp-server-for-studioassist">Katalon StudioAssist</a> via an MCP proxy.

**Step 1:** Install the MCP proxy by following the <a href="https://docs.katalon.com/katalon-studio/studioassist/mcp-servers/setting-up-mcp-proxy-for-stdio-mcp-servers">MCP proxy setup guide</a>.

**Step 2:** Start the Chrome DevTools MCP server with the proxy:

```bash
mcp-proxy --transport streamablehttp --port 8080 -- npx -y chrome-devtools-mcp@latest
```

**Note:** You may need to pick another port if 8080 is already in use.

**Step 3:** In Katalon Studio, add the server to StudioAssist with the following settings:

- **Connection URL:** `http://127.0.0.1:8080/mcp`
- **Transport type:** `HTTP`

Once connected, the Chrome DevTools MCP tools will be available in StudioAssist.

</details>

<details>
  <summary>Mistral Vibe</summary>

Add in ~/.vibe/config.toml:

```toml
[[mcp_servers]]
name = "chrome-devtools"
transport = "stdio"
command = "npx"
args = ["chrome-devtools-mcp@latest"]
```

</details>

<details>
  <summary>OpenCode</summary>

Add the following configuration to your `opencode.json` file. If you don't have one, create it at `~/.config/opencode/opencode.json` (<a href="https://opencode.ai/docs/mcp-servers">guide</a>):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

</details>

<details>
  <summary>Qoder</summary>

In **Qoder Settings**, go to `MCP Server` > `+ Add` > Use the configuration snippet provided above.

Alternatively, follow the <a href="https://docs.qoder.com/user-guide/chat/model-context-protocol">MCP guide</a> and use the standard config from above.

</details>

<details>
  <summary>Qoder CLI</summary>

Install the Chrome DevTools MCP server using the Qoder CLI (<a href="https://docs.qoder.com/cli/using-cli#mcp-servers">guide</a>):

**Project wide:**

```bash
qodercli mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

**Globally:**

```bash
qodercli mcp add -s user chrome-devtools -- npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Visual Studio</summary>

**Click the button to install:**

[<img src="https://img.shields.io/badge/Visual_Studio-Install-C16FDE?logo=visualstudio&logoColor=white" alt="Install in Visual Studio">](https://vs-open.link/mcp-install?%7B%22name%22%3A%22chrome-devtools%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22chrome-devtools-mcp%40latest%22%5D%7D)

</details>

<details>
  <summary>Warp</summary>

Go to `Settings | AI | Manage MCP Servers` -> `+ Add` to [add an MCP Server](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server). Use the config provided above.

</details>

<details>
  <summary>Windsurf</summary>
  Follow the <a href="https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json">configure MCP guide</a>
  using the standard config from above.
</details>

### Your first prompt

Enter the following prompt in your MCP Client to check if everything is working:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should open the browser and record a performance trace.

> [!NOTE]
> The MCP server will start the browser automatically once the MCP client uses a tool that requires a running browser instance. Connecting to the Chrome DevTools MCP server on its own will not automatically start the browser.

## Tools

If you run into any issues, checkout our [troubleshooting guide](./docs/troubleshooting.md).

<!-- BEGIN AUTO GENERATED TOOLS -->

- **Input automation** (10 tools)
  - [`click`](docs/tool-reference.md#click)
  - [`drag`](docs/tool-reference.md#drag)
  - [`fill`](docs/tool-reference.md#fill)
  - [`fill_form`](docs/tool-reference.md#fill_form)
  - [`handle_dialog`](docs/tool-reference.md#handle_dialog)
  - [`hover`](docs/tool-reference.md#hover)
  - [`press_key`](docs/tool-reference.md#press_key)
  - [`type_text`](docs/tool-reference.md#type_text)
  - [`upload_file`](docs/tool-reference.md#upload_file)
  - [`click_at`](docs/tool-reference.md#click_at)
- **Navigation automation** (6 tools)
  - [`close_page`](docs/tool-reference.md#close_page)
  - [`list_pages`](docs/tool-reference.md#list_pages)
  - [`navigate_page`](docs/tool-reference.md#navigate_page)
  - [`new_page`](docs/tool-reference.md#new_page)
  - [`select_page`](docs/tool-reference.md#select_page)
  - [`wait_for`](docs/tool-reference.md#wait_for)
- **Emulation** (2 tools)
  - [`emulate`](docs/tool-reference.md#emulate)
  - [`resize_page`](docs/tool-reference.md#resize_page)
- **Performance** (3 tools)
  - [`performance_analyze_insight`](docs/tool-reference.md#performance_analyze_insight)
  - [`performance_start_trace`](docs/tool-reference.md#performance_start_trace)
  - [`performance_stop_trace`](docs/tool-reference.md#performance_stop_trace)
- **Network** (2 tools)
  - [`get_network_request`](docs/tool-reference.md#get_network_request)
  - [`list_network_requests`](docs/tool-reference.md#list_network_requests)
- **Debugging** (8 tools)
  - [`evaluate_script`](docs/tool-reference.md#evaluate_script)
  - [`get_console_message`](docs/tool-reference.md#get_console_message)
  - [`lighthouse_audit`](docs/tool-reference.md#lighthouse_audit)
  - [`list_console_messages`](docs/tool-reference.md#list_console_messages)
  - [`take_screenshot`](docs/tool-reference.md#take_screenshot)
  - [`take_snapshot`](docs/tool-reference.md#take_snapshot)
  - [`screencast_start`](docs/tool-reference.md#screencast_start)
  - [`screencast_stop`](docs/tool-reference.md#screencast_stop)
- **Memory** (12 tools)
  - [`take_heapsnapshot`](docs/tool-reference.md#take_heapsnapshot)
  - [`close_heapsnapshot`](docs/tool-reference.md#close_heapsnapshot)
  - [`compare_heapsnapshots`](docs/tool-reference.md#compare_heapsnapshots)
  - [`get_heapsnapshot_class_nodes`](docs/tool-reference.md#get_heapsnapshot_class_nodes)
  - [`get_heapsnapshot_details`](docs/tool-reference.md#get_heapsnapshot_details)
  - [`get_heapsnapshot_dominators`](docs/tool-reference.md#get_heapsnapshot_dominators)
  - [`get_heapsnapshot_duplicate_strings`](docs/tool-reference.md#get_heapsnapshot_duplicate_strings)
  - [`get_heapsnapshot_edges`](docs/tool-reference.md#get_heapsnapshot_edges)
  - [`get_heapsnapshot_object_details`](docs/tool-reference.md#get_heapsnapshot_object_details)
  - [`get_heapsnapshot_retainers`](docs/tool-reference.md#get_heapsnapshot_retainers)
  - [`get_heapsnapshot_retaining_paths`](docs/tool-reference.md#get_heapsnapshot_retaining_paths)
  - [`get_heapsnapshot_summary`](docs/tool-reference.md#get_heapsnapshot_summary)
- **Extensions** (5 tools)
  - [`install_extension`](docs/tool-reference.md#install_extension)
  - [`list_extensions`](docs/tool-reference.md#list_extensions)
  - [`reload_extension`](docs/tool-reference.md#reload_extension)
  - [`trigger_extension_action`](docs/tool-reference.md#trigger_extension_action)
  - [`uninstall_extension`](docs/tool-reference.md#uninstall_extension)
- **Third-party** (2 tools)
  - [`execute_3p_developer_tool`](docs/tool-reference.md#execute_3p_developer_tool)
  - [`list_3p_developer_tools`](docs/tool-reference.md#list_3p_developer_tools)
- **WebMCP** (2 tools)
  - [`execute_webmcp_tool`](docs/tool-reference.md#execute_webmcp_tool)
  - [`list_webmcp_tools`](docs/tool-reference.md#list_webmcp_tools)

<!-- END AUTO GENERATED TOOLS -->

## Configuration

The Chrome DevTools MCP server supports the following configuration option:

<!-- BEGIN AUTO GENERATED OPTIONS -->

- **`--autoConnect`/ `--auto-connect`**
  If specified, automatically connects to a browser (Chrome 144+) running locally from the user data directory identified by the channel param (default channel is stable). Requires the remote debugging server to be started in the Chrome instance via chrome://inspect/#remote-debugging.
  - **Type:** boolean
  - **Default:** `false`

- **`--browserUrl`/ `--browser-url`, `-u`**
  Connect to a running, debuggable Chrome instance (e.g. `http://127.0.0.1:9222`). For more details see: https://github.com/ChromeDevTools/chrome-devtools-mcp#connecting-to-a-running-chrome-instance.
  - **Type:** string
  - **Default:** `false`

- **`--wsEndpoint`/ `--ws-endpoint`, `-w`**
  WebSocket endpoint to connect to a running Chrome instance (e.g., ws://127.0.0.1:9222/devtools/browser/<id>). Alternative to --browserUrl.
  - **Type:** string
  - **Default:** `false`

- **`--wsHeaders`/ `--ws-headers`**
  Custom headers for WebSocket connection in JSON format (e.g., '{"Authorization":"Bearer token"}'). Only works with --wsEndpoint.
  - **Type:** string
  - **Default:** `false`

- **`--headless`**
  Whether to run in headless (no UI) mode.
  - **Type:** boolean
  - **Default:** `false`

- **`--executablePath`/ `--executable-path`, `-e`**
  Path to custom Chrome executable.
  - **Type:** string
  - **Default:** `false`

- **`--isolated`**
  If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to false.
  - **Type:** boolean
  - **Default:** `false`

- **`--userDataDir`/ `--user-data-dir`**
  Path to the user data directory for Chrome. Default is $HOME/.cache/chrome-devtools-mcp/chrome-profile$CHANNEL_SUFFIX_IF_NON_STABLE
  - **Type:** string
  - **Default:** `false`

- **`--channel`**
  Specify a different Chrome channel that should be used. The default is the stable channel version.
  - **Type:** string
  - **Choices:** `canary`, `dev`, `beta`, `stable`
  - **Default:** `false`

- **`--logFile`/ `--log-file`**
  Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.
  - **Type:** string
  - **Default:** `false`

- **`--viewport`**
  Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.
  - **Type:** string
  - **Default:** `false`

- **`--proxyServer`/ `--proxy-server`**
  Proxy server configuration for Chrome passed as --proxy-server when launching the browser. See https://www.chromium.org/developers/design-documents/network-settings/ for details.
  - **Type:** string
  - **Default:** `false`

- **`--acceptInsecureCerts`/ `--accept-insecure-certs`**
  If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalPageIdRouting`/ `--experimental-page-id-routing`**
  Whether to expose pageId on page-scoped tools and route requests by page ID (useful for concurrent agent sessions).
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalDevtools`/ `--experimental-devtools`**
  Whether to enable automation over DevTools targets
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalVision`/ `--experimental-vision`**
  Whether to enable coordinate-based tools such as click_at(x,y). Usually requires a computer-use model able to produce accurate coordinates by looking at screenshots.
  - **Type:** boolean
  - **Default:** `false`

- **`--memoryDebugging`/ `--memory-debugging`, `-experimentalMemory`**
  Whether to enable memory debugging tools.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalStructuredContent`/ `--experimental-structured-content`**
  Whether to output structured formatted content.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalIncludeAllPages`/ `--experimental-include-all-pages`**
  Whether to include all kinds of pages such as webviews or background pages as pages.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalScreencast`/ `--experimental-screencast`**
  Exposes experimental screencast tools (requires ffmpeg). Install ffmpeg https://www.ffmpeg.org/download.html and ensure it is available in the MCP server PATH.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalFfmpegPath`/ `--experimental-ffmpeg-path`**
  Path to ffmpeg executable for screencast recording.
  - **Type:** string
  - **Default:** `false`

- **`--categoryExperimentalWebmcp`/ `--category-experimental-webmcp`**
  Set to true to enable debugging WebMCP tools. Requires Chrome 150+ with the following flag: `--enable-features=WebMCP`
  - **Type:** boolean
  - **Default:** `false`

- **`--chromeArg`/ `--chrome-arg`**
  Additional arguments for Chrome. Only applies when Chrome is launched by chrome-devtools-mcp.
  - **Type:** array
  - **Default:** `false`

- **`--blockedUrlPattern`/ `--blocked-url-pattern`**
  Restricts browser's network access by blocking specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Silently detaches from targets with blocked URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns.
  - **Type:** array
  - **Default:** `false`

- **`--allowedUrlPattern`/ `--allowed-url-pattern`**
  Restricts browser's network access by allowing only specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Requires Chrome 149+. Silently detaches from targets with unallowed URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns.
  - **Type:** array
  - **Default:** `false`

- **`--ignoreDefaultChromeArg`/ `--ignore-default-chrome-arg`**
  Explicitly disable default arguments for Chrome. Only applies when Chrome is launched by chrome-devtools-mcp.
  - **Type:** array
  - **Default:** `false`

- **`--categoryEmulation`/ `--category-emulation`**
  Set to false to exclude tools related to emulation.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryPerformance`/ `--category-performance`**
  Set to false to exclude tools related to performance.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryNetwork`/ `--category-network`**
  Set to false to exclude tools related to network.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryExtensions`/ `--category-extensions`**
  Set to true to include tools related to extensions. Note: This feature is currently only supported with a pipe connection. autoConnect, browserUrl, and wsEndpoint are not supported with this feature until 149 will be released.
  - **Type:** boolean
  - **Default:** `false`

- **`--categoryExperimentalThirdParty`/ `--category-experimental-third-party`**
  Set to true to enable third-party developer tools exposed by the inspected page itself
  - **Type:** boolean
  - **Default:** `false`

- **`--performanceCrux`/ `--performance-crux`**
  Set to false to disable sending URLs from performance traces to CrUX API to get field performance data.
  - **Type:** boolean
  - **Default:** `true`

- **`--usageStatistics`/ `--usage-statistics`**
  Set to false to opt-out of usage statistics collection. Google collects usage data to improve the tool, handled under the Google Privacy Policy (https://policies.google.com/privacy). This is independent from Chrome browser metrics. Disabled if `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` or `CI` env variables are set.
  - **Type:** boolean
  - **Default:** `true`

- **`--screenshotFormat`/ `--screenshot-format`**
  Override the default output format used by take_screenshot when the caller does not specify one. JPEG and WebP are ~3-5x smaller than PNG, which helps reduce context size in AI conversations. Unset preserves the existing default ("png").
  - **Type:** string
  - **Choices:** `jpeg`, `png`, `webp`
  - **Default:** `false`

- **`--screenshotQuality`/ `--screenshot-quality`**
  Override the default compression quality (0-100) used by take_screenshot for JPEG and WebP when the caller does not specify one. Lower values mean smaller files. Ignored for PNG. Unset preserves the Puppeteer default.
  - **Type:** number
  - **Default:** `false`

- **`--screenshotMaxWidth`/ `--screenshot-max-width`**
  Maximum width in pixels for screenshots. If the captured image is wider, it is downscaled (preserving aspect ratio) before being returned. Reduces context size in AI conversations. Unset means no resize.
  - **Type:** number
  - **Default:** `false`

- **`--screenshotMaxHeight`/ `--screenshot-max-height`**
  Maximum height in pixels for screenshots. If the captured image is taller, it is downscaled (preserving aspect ratio) before being returned. Can be combined with --screenshot-max-width; the smaller scale factor wins. Unset means no resize.
  - **Type:** number
  - **Default:** `false`

- **`--slim`**
  Exposes a "slim" set of 3 tools covering navigation, script execution and screenshots only. Useful for basic browser tasks.
  - **Type:** boolean
  - **Default:** `false`

- **`--redactNetworkHeaders`/ `--redact-network-headers`**
  If true, redacts some of the network headers considered sensitive before returning to the client.
  - **Type:** boolean
  - **Default:** `false`

- **`--allowUnrestrictedPaths`/ `--allow-unrestricted-paths`**
  If set, disables the default path restriction that applies when the MCP client does not negotiate the roots capability. By default, file-writing tools are restricted to the OS temp directory when no roots are configured. Use this only when connecting a trusted local client that does not implement MCP roots and requires access to paths outside the temp directory.
  - **Type:** boolean
  - **Default:** `false`

<!-- END AUTO GENERATED OPTIONS -->

Pass them via the `args` property in the JSON configuration. For example:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--channel=canary",
        "--headless=true",
        "--isolated=true"
      ]
    }
  }
}
```

### Connecting via WebSocket with custom headers

You can connect directly to a Chrome WebSocket endpoint and include custom headers (e.g., for authentication):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--wsEndpoint=ws://127.0.0.1:9222/devtools/browser/<id>",
        "--wsHeaders={\"Authorization\":\"Bearer YOUR_TOKEN\"}"
      ]
    }
  }
}
```

To get the WebSocket endpoint from a running Chrome instance, visit `http://127.0.0.1:9222/json/version` and look for the `webSocketDebuggerUrl` field.

You can also run `npx chrome-devtools-mcp@latest --help` to see all available configuration options.

## Concepts

### Concurrent sessions

Most MCP clients start one Chrome DevTools MCP server per conversation. If your
client shares a single server instance across concurrent agents or subagents,
start the server with `--experimentalPageIdRouting`. This exposes `pageId` on
page-scoped tools so each agent can route tool calls to the tab it is working
with.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--experimentalPageIdRouting"
      ]
    }
  }
}
```

If you run multiple independent MCP client sessions and want each session to
launch its own temporary Chrome profile, also pass `--isolated`. This avoids
sharing the default Chrome DevTools MCP user data directory between those
server instances.

### User data directory

`chrome-devtools-mcp` starts a Chrome's stable channel instance using the following user
data directory:

- Linux / macOS: `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- Windows: `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

The user data directory is not cleared between runs and shared across
all instances of `chrome-devtools-mcp`. Set the `isolated` option to `true`
to use a temporary user data dir instead which will be cleared automatically after
the browser is closed.

### Connecting to a running Chrome instance

By default, the Chrome DevTools MCP server will start a new Chrome instance with a dedicated profile. This might not be ideal in all situations:

- If you would like to maintain the same application state when alternating between manual site testing and agent-driven testing.
- When the MCP needs to sign into a website. Some accounts may prevent sign-in when the browser is controlled via WebDriver (the default launch mechanism for the Chrome DevTools MCP server).
- If you're running your LLM inside a sandboxed environment, but you would like to connect to a Chrome instance that runs outside the sandbox.

In these cases, start Chrome first and let the Chrome DevTools MCP server connect to it. There are two ways to do so:

- **Automatic connection (available in Chrome 144)**: best for sharing state between manual and agent-driven testing.
- **Manual connection via remote debugging port**: best when running inside a sandboxed environment.

#### Automatically connecting to a running Chrome instance

**Step 1:** Set up remote debugging in Chrome

In Chrome (\>= M144), do the following to set up remote debugging:

1.  Navigate to `chrome://inspect/#remote-debugging` to enable remote debugging.
2.  Follow the dialog UI to allow or disallow incoming debugging connections.

**Step 2:** Configure Chrome DevTools MCP server to automatically connect to a running Chrome Instance

To connect the `chrome-devtools-mcp` server to the running Chrome instance, use
`--autoConnect` command line argument for the MCP server.

The following code snippet is an example configuration for gemini-cli:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--autoConnect"]
    }
  }
}
```

**Step 3:** Test your setup

Make sure your browser is running. Open gemini-cli and run the following prompt:

```none
Check the performance of https://developers.chrome.com
```

> [!NOTE]
> The <code>autoConnect</code> option requires the user to start Chrome. If the user has multiple active profiles, the MCP server will connect to the default profile (as determined by Chrome). The MCP server has access to all open windows for the selected profile.

The Chrome DevTools MCP server will try to connect to your running Chrome
instance. It shows a dialog asking for user permission.

Clicking **Allow** results in the Chrome DevTools MCP server opening
[developers.chrome.com](http://developers.chrome.com) and taking a performance
trace.

#### Manual connection using port forwarding

You can connect to a running Chrome instance by using the `--browser-url` option. This is useful if you are running the MCP server in a sandboxed environment that does not allow starting a new Chrome instance.

Here is a step-by-step guide on how to connect to a running Chrome instance:

**Step 1: Configure the MCP client**

Add the `--browser-url` option to your MCP client configuration. The value of this option should be the URL of the running Chrome instance. `http://127.0.0.1:9222` is a common default.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

**Step 2: Start the Chrome browser**

> [!WARNING]
> Enabling the remote debugging port opens up a debugging port on the running browser instance. Any application on your machine can connect to this port and control the browser. Make sure that you are not browsing any sensitive websites while the debugging port is open.

Start the Chrome browser with the remote debugging port enabled. Make sure to close any running Chrome instances before starting a new one with the debugging port enabled. The port number you choose must be the same as the one you specified in the `--browser-url` option in your MCP client configuration.

For security reasons, [Chrome requires you to use a non-default user data directory](https://developer.chrome.com/blog/remote-debugging-port) when enabling the remote debugging port. You can specify a custom directory using the `--user-data-dir` flag. This ensures that your regular browsing profile and data are not exposed to the debugging session.

**macOS**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Linux**

```bash
/usr/bin/google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Windows**

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-profile-stable"
```

**Step 3: Test your setup**

After configuring the MCP client and starting the Chrome browser, you can test your setup by running a simple prompt in your MCP client:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should connect to the running Chrome instance and receive a performance report.

If you hit VM-to-host port forwarding issues, see the “Remote debugging between virtual machine (VM) and host fails” section in [`docs/troubleshooting.md`](./docs/troubleshooting.md#remote-debugging-between-virtual-machine-vm-and-host-fails).

For more details on remote debugging, see the [Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/remote-debugging/).

### Debugging Chrome on Android

Please consult [these instructions](./docs/debugging-android.md).

## Known limitations

See [Troubleshooting](./docs/troubleshooting.md).

## Integrating as a browser subagent

If you are developing agentic tooling and want to provide an integrated browser subagent as part of your product, we recommend building on top of Chrome DevTools for agents.

For a reference implementation, see the [Gemini CLI browser agent documentation](https://geminicli.com/docs/core/subagents/#browser-agent).

---

<!-- LOCALIZED:360Chromex -->

# 中文使用指南（本地化版 · 全局安装 · 拷贝即走）

> 本文为 chrome-devtools-mcp 的**中文本地化使用指南**，覆盖架构、安装、部署、使用与上游跟进。上方为上游英文原版 README（命令与英文术语保留供精确参考），日常以下方中文为准。
> 本文已做**模块化、结构化整理**，内容不删减；与旧版相比主要变化：① 服务器改为**全局安装**（`npm install -g`，位于 `$(npm root -g)`）；② 主副本文件夹**拷贝即走**（不含 node_modules/build）；③ 浏览器**自动检测并规避便携版**；④ 新增 **MCP 服务模式 / CLI 模式 二选一**的初始检测逻辑。

---

## 模块 0：架构总览与核心约定

- **服务器全局安装（符号链接模式）**：`npm install -g .` 会在 `$(npm root -g)`（npm 全局根目录，随 Node 安装位置而定）下创建名为 `chrome-devtools-mcp` 的**符号链接**，指向本文件夹；它**不拷贝、也不安装依赖**。运行时依赖与构建产物实际位于被链接的文件夹（`node_modules/` + `build/`）。调用方一律走全局 bin：`$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`（经符号链接解析到本文件夹）。因此主副本文件夹本身保持最小化、可拷贝即走；依赖在激活后由 `deploy.cjs` 装到该文件夹。
- **拷贝即走**：把整个 `chrome-devtools/` 文件夹复制到任意电脑、激活主 `SKILL.md`，Agent 即可自主完成「全局安装 → 构建 → 浏览器检测/启动 → 暴露工具」，无需预装。
- **跨平台说明**：底层脚本（deploy / upstream / copyDir / verify_browser）均为跨平台实现；本地化默认面向 **Windows + 360Chromex（含登录态）**。在 macOS / Linux 上可改用本机 Chrome（去掉 360Chromex 相关步骤，`verify_browser.cjs` 会检测 Chrome 的注册表/PATH 候选），其余流程一致。
- **复用登录态、零下载**：仅依赖 puppeteer-core，**不下载任何浏览器内核**（`PUPPETEER_SKIP_DOWNLOAD=1` 由部署脚本内置）。
- **严禁 `npx -y <pkg>`**：一律用 `node "$(npm root -g)/..."` 运行，或用 `npm install -g .` 全局安装。各环境命令见下文「模块 4」。
- **本地化段标记**：以哨兵 `LOCALIZED:360Chromex` 标记；`apply_localize.cjs --strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。

### 主副本目录结构（拷贝即走）

```
chrome-devtools/                ← 整个文件夹拷贝即走
├── SKILL.md                    ← 顶层自描述入口（由 apply_localize 从 skills/chrome-devtools/SKILL.md 同步）
├── README.md                   ← 本文（含本地化段）
├── sync_and_deploy.cjs         ← 单入口部署（先 mirror_to_target 镜像，再 localization/deploy 部署，强制顺序）
├── mirror_to_target.cjs        ← 主副本→部署副本镜像（覆盖源码/本地化，含完整性校验 verifySync）
├── package.json                ← 含 overrides.zod 固定（compat.cjs 维护）+ config.allowScripts 声明意图
├── package-lock.json           ├─ 上游源码镜像（self-evolution 参考 + 构建基线）
├── server.json / tsconfig.json / .npmrc（allow-scripts[] 实际批准安装脚本）/ .nvmrc / .gitignore / LICENSE
├── src/  skills/  scripts/     ← 上游源码镜像（随上游升级刷新）
├── localization/               ← 自包含工具链（见模块 6）
│   ├── deploy.cjs              ← 全局安装 + 构建 + 生成 MCP 配置
│   ├── upstream.cjs            ← 纯网络上游升级（全局卸载/安装/构建）
│   ├── compat.cjs              ← 固定 zod 兼容版本（避免 v4 编译失败）
│   ├── apply_localize.cjs      ← 注入/剥离本地化段与中文 description
│   ├── verify_browser.cjs      ← 自动检测浏览器（规避便携版）
│   ├── start.cjs               ← 启动浏览器调试端口（复用登录态）
│   ├── cli_run.cjs             ← CLI 模式辅助脚本（仅 CLI 模式，可被删除）
│   └── fragments/              ← 本地化片段（README/SKILL 文本与 description）
├── local-config.json           ← 浏览器路径/用户数据/端口（verify_browser 生成）
├── mcp-local-config.json       ← 生成的 MCP 接入配置（全局 bin 路径）
└──（不含 node_modules / build）← 运行时依赖与构建产物由 `deploy.cjs` 在本文件夹安装（并经 $(npm root -g) 的符号链接暴露全局 bin）；拷贝即走的恰是此最小文件夹
```

---

## 模块 1：前置条件

- Node.js ≥ 20.19（本机 v24.18.0 已满足；全局 bin 的 `node` 即系统 Node）。
- 本机浏览器：360Chromex 安装目录可通过环境变量 `CHROME_DEVTOOLS_360_DIR` 覆盖（缺省 `D:\Tools\360Chrome`，仅本机有效；其它机器请设置该变量或依赖注册表/PATH 自动检测）；其它机器运行 `node localization/verify_browser.cjs` 自动检测并写入 `local-config.json`（优先已注册安装，规避便携版）。
- 依赖与构建：**不随文件夹携带**，首次激活由 `node localization/deploy.cjs` 全局安装并构建（恒跳过浏览器下载）。

---

## 模块 2：快速开始（一键部署 / 拷贝即走）

> 推荐单入口（强制"先镜像、再部署"顺序，避免主副本改动后部署副本失同步）：

```
node sync_and_deploy.cjs            # 主副本根目录执行：先 mirror_to_target 镜像，再 localization/deploy 部署
# 如需镜像阶段严格校验（缺失即非零退出），追加 --strict：
node sync_and_deploy.cjs --strict
```

该单入口依次：① 镜像主副本→部署副本（同步源码/本地化，并跑 `verifySync` 完整性校验，报告源有而目标缺的项）→ ② 在部署副本自动检测浏览器（缺失则交互要求指定并写入配置）→ ③ 全局安装依赖/构建（恒跳过浏览器下载，写入 `$(npm root -g)`；依赖 .npmrc 的 `allow-scripts[]` 在安装时即批准并运行 5 个包 install scripts、消除 `allow-scripts` 噪声）→ ④ 幂等重注入本地化（**兼容 CRLF 行尾**，用 `\r?\n` 完整吃掉换行，子技能 SKILL.md 的 `description` 行不再因尾随 `\r` 误判"无 description 行"）→ ⑤ 生成 `mcp-local-config.json`（全局 bin 路径）并以**字段级合并**写入 `~/.workbuddy/mcp.json`（保留既有 `disabled` 等字段，不静默反转启用状态）。

若部署副本已是最新镜像、仅需重新装依赖/构建/生成配置，可直接在部署副本运行 `node localization/deploy.cjs`。

手动分步（等价于上述一键）：

1. 关闭已打开的浏览器（避免 user-data-dir 锁冲突）。
2. 启动调试端口：`node localization/start.cjs`（自动检测并复用登录态）。
3. 在 WorkBuddy 的 MCP 配置（`~/.workbuddy/mcp.json`）加入 `mcp-local-config.json` 内容：
   - command: `node`
   - args: `["<全局 bin 路径>", "--browserUrl=http://127.0.0.1:9222", "--no-usage-statistics"]`
   - env: `{ "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS": "1" }`
4. 在 WorkBuddy 连接器管理页"信任" chrome-devtools 服务器。

> 全局 bin 路径获取：macOS/Linux/Git Bash 用 `$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`；Windows(cmd) 用 `for /f "delims=" %i in ('npm root -g') do echo %i\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js`；Windows(PowerShell) 用 `(npm root -g) + '\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js'`。

---

## 模块 3：浏览器自动检测与启动（复用登录态，规避便携版）

`verify_browser.cjs` 自动检测本地浏览器，写入 `local-config.json`：

- **搜索范围（Windows）**：已知安装目录（`CHROME_DEVTOOLS_360_DIR` 指定的目录（缺省 `D:\Tools\360Chrome`）、`Program Files\Google\Chrome`、`Program Files\360Chrome`）、Windows 注册表（`App Paths` 与 `Uninstall` 项）；以及 `PATH` 中的候选。
- **规避便携版**：已注册安装（Program Files / 注册表 / 已知目录）优先采用；仅当只找到 `PATH` 中未注册/便携版时，会**提示用户确认**，不会静默误用（便携版登录态不可靠）。
- **优先 360Chromex**（保留登录态），其次 Chrome。用户数据目录默认取 `CHROME_DEVTOOLS_360_DIR` 目录下的 `User Data`（360Chromex）或 `%LOCALAPPDATA%\Google\Chrome\User Data`（Chrome），否则取 exe 同级 `User Data`。

`start.cjs` 以 `--remote-debugging-port` + `--user-data-dir` 启动（**禁用 `--isolated`**，避免丢登录态），并打印全局路径的 MCP 接入信息。

> Agent 每次激活技能、调用任何浏览器能力前，应先 `curl http://127.0.0.1:9222/json/version` 检测端口；仅当无响应才运行 `verify_browser.cjs` + `start.cjs`，避免重复启动锁冲突。

---

## 模块 4：两种使用模式（MCP 服务模式 / CLI 模式）与初始检测

chrome-devtools 可二选一使用，**严禁 `npx -y`**，一律走全局路径。

### 4.1 初始检测逻辑（每次使用开始时执行）

1. **检测是否已配置 MCP 服务模式**：读取 `~/.workbuddy/mcp.json`（或当前 Agent 的 MCP 配置），若含名为 `chrome-devtools` 的条目（command 指向本全局包 bin），即视为"MCP 服务模式已安装"。
   - **若已安装 MCP 服务模式**：全程使用 MCP 工具，**禁止**走 CLI 子命令。可询问用户是否删除 CLI 模式辅助脚本 `localization/cli_run.cjs`（仅 CLI 用，删除不影响 MCP）；用户拒绝则保留。
   - **若未检测到 MCP 服务模式**：询问用户是否采用全局安装以使用 CLI 模式（`npm install -g .`）。用户明确"安装" → 执行 `node localization/deploy.cjs` 后继续 CLI 模式；用户明确"不安装" → **立即终止任务**。
2. 若全局 bin 不存在（未安装），先 `node localization/deploy.cjs` 完成全局安装与构建。

### 4.2 MCP 服务模式（推荐，WorkBuddy 原生工具）

在 `~/.workbuddy/mcp.json` 加入（全局路径）：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["<全局 bin 路径>", "--browserUrl=http://127.0.0.1:9222", "--no-usage-statistics"],
      "env": { "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS": "1" }
    }
  }
}
```

在 WorkBuddy 连接器管理页"信任"后即可使用29 个原生工具。

### 4.3 CLI 模式（不配 MCP 也可用，二选一）

直接用全局 bin 运行单工具（首参数为工具名）。**各环境命令形式**（严禁 npx）：

- macOS / Linux / Git Bash：
  ```bash
  node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (cmd.exe)：
  ```bat
  for /f "delims=" %i in ('npm root -g') do node "%i\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```
- Windows (PowerShell)：
  ```powershell
  $g = npm root -g; node "$g/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" <tool> [参数] --browserUrl=http://127.0.0.1:9222 --no-usage-statistics
  ```

或等价使用 CLI 辅助脚本（仅 CLI 模式、可被删除）：`node localization/cli_run.cjs <tool> [参数]`。

例如 `node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js" take_snapshot --browserUrl=http://127.0.0.1:9222 --no-usage-statistics`。

---

## 模块 5：常用操作速查（MCP 工具名保持英文）

- **页面/导航**：`list_pages`（列出页）、`select_page`（切换）、`navigate_page --url`（导航）、`new_page`（新建）、`close_page`
- **结构/交互**：`take_snapshot`（文本快照，获取元素 `uid`）、`click <uid>`、`fill <uid> <文本>`、`hover`、`drag <src> <dst>`、`press_key`、`type_text`、`upload_file`
- **截图**：`take_screenshot`（可 `--fullPage`、`--filePath` 存盘）
- **控制台/日志**：`list_console_messages`、`get_console_message`
- **网络**：`list_network_requests`（可分页/过滤）、`get_network_request`
- **性能/内存**：`performance_start_trace` / `performance_stop_trace`（可存盘）、`performance_analyze_insight`、`take_heapsnapshot`
- **脚本**：`evaluate_script "() => document.title"`（页面执行 JS）

**典型工作流**：导航（`navigate_page`）→ 等待（`wait_for`）→ 快照（`take_snapshot` 取 uid）→ 交互（`click`/`fill` 等）→ 必要时截图或读控制台/网络。可并行发起多个工具调用，但顺序保持 导航→等待→快照→交互。

---

## 模块 6：上游跟进与本地化更新（自演进，纯网络，保全本地化）

任一 Agent 阅读本文件后，可精准调用 `gh` / `npm` / 网络工具查询、下载、跟进 `ChromeDevTools/chrome-devtools-mcp` 上游演进/更新，**且全程不丧失本地化特性与约束**。本主副本**不含 .git**，故全部走纯网络方式。

### 1) 查询上游状态

- 最新版本：`npm view chrome-devtools-mcp version` 或 `gh release list -R ChromeDevTools/chrome-devtools-mcp`
- 发布详情：`gh api repos/ChromeDevTools/chrome-devtools-mcp/releases/latest`
- 仓库概览：`gh repo view ChromeDevTools/chrome-devtools-mcp`

### 2) 一键升级（推荐，全局）

```
node localization/upstream.cjs
```

自动完成：检测新版本 → `git clone --depth 1` 拉源码 → 剥离并覆盖本地目标文件（保留 localization/、mirror_to_target.cjs、sync_and_deploy.cjs）→ 重注入本地化（保全约束，兼容 CRLF 行尾）→ 重新固定 zod（compat.cjs）→ **保全 package.json 本地增量**（整文件覆盖后回填上游没有的 `scripts` 键，如 `test:localization`，避免本地定制丢失）→ **全局卸载/安装/构建**（依赖位于 `$(npm root -g)`，`config.allowScripts` 预批准 5 个包 + deploy.cjs 显式 `npm approve-scripts --allow-scripts-pending` 提交批准，仅 `config.allowScripts` 不足以抑制警告）→ 重新部署（生成全局路径 MCP 配置；`~/.workbuddy/mcp.json` 字段级合并保留既有 `disabled`）。

### 3) 手动升级（纯命令，不依赖脚本）

> 注意：上游 npm 发布包仅含 `build/` 产物与 `README.md`，**不含 `src/` 与 `skills/`**；因此同步源码与 SKILL.md 必须从 GitHub 源码仓库获取，不能仅靠 `npm pack`。

```sh
git clone --depth 1 https://github.com/ChromeDevTools/chrome-devtools-mcp.git <临时目录>
# 将 <临时目录> 的 src/ skills/ scripts/ 以及 README.md package.json server.json puppeteer.config.cjs tsconfig.json .npmrc .nvmrc .gitignore 覆盖到本仓库（保留 localization/ 与 mirror_to_target.cjs）
node localization/apply_localize.cjs --strip   # 剥离旧本地化段（还原纯上游原文基线）
node localization/apply_localize.cjs           # 重注入最新片段（含 description 中文化，幂等）
PUPPETEER_SKIP_DOWNLOAD=1 npm install          # 先在本文件夹装齐依赖（devDependencies，含 puppeteer-core 等运行时；注意 npm install -g . 不会装依赖）
PUPPETEER_SKIP_DOWNLOAD=1 npm install -g .      # 在 $(npm root -g) 建符号链接指向本文件夹（不拷贝、不装依赖）
npm run build                                  # 在本文件夹构建（tsc -> build/；其全局符号链接即 $(npm root -g)/chrome-devtools-mcp）
node localization/deploy.cjs                   # 重新部署（生成全局路径 MCP 配置）
```

### 4) 本地化保全红线（任何 Agent 操作不得违反）

- 依赖安装必须 `PUPPETEER_SKIP_DOWNLOAD=1`，否则 puppeteer 会下载 Chromium。
- 复用登录态必须 `--browserUrl` 直连已启动的浏览器；`--isolated` 默认临时 profile 会丢登录态。
- 浏览器用 `--executablePath` 不用 `--channel`。
- **严禁 `npx -y`**：一律 `node "$(npm root -g)/..."` 或 `npm install -g .`。
- `package.json` 本地增量（如 `scripts.test:localization`、`config.allowScripts`）由 `upstream.cjs` 在升级时保全；新增本地定制须落在"上游无、本地有"的键上，否则整文件覆盖升级时会被上游抹掉。
- `deploy.cjs` 向 `~/.workbuddy/mcp.json` 写入 chrome-devtools 条目采用**字段级合并**（保留用户原有 `disabled` 等字段），任何改动不得改回整条目覆盖，以免静默反转启用状态。
- 中文路径在本机会导致 node/npm 失败；跨机移植以 ASCII 路径主副本为准，脚本均按脚本所在目录相对解析。
- `--categoryExtensions` 仅 pipe 连接支持；`--browserUrl` 模式暂不支持（待上游 #149）。
- 本地化段以哨兵 `LOCALIZED:360Chromex` 标记；`--strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。

---

## 模块 7：Agent 自主验证（全功能测试）与三大陷阱

将本主副本作为 Skill 部署后，可由 Agent 编写 MCP 客户端脚本（`@modelcontextprotocol/sdk` 的 `Client` + `StdioClientTransport`）直连**全局 bin**（`$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`），连接 360Chromex 调试实例（端口 9222），逐项验证 `list_pages` / `navigate_page` / `take_snapshot` / `take_screenshot` / `evaluate_script` / `list_console_messages` / `list_network_requests` 等工具。验证中踩坑并修正的**三处陷阱**如下，供任何 Agent 自主验证时参考：

### 陷阱 1：MCP SDK 的 `Client` 没有 `EventEmitter.on`

`@modelcontextprotocol/sdk`（本机 1.29.0）的 `Client` 原型链为 `Client → Protocol → Object`，**没有 `EventEmitter.on`**。若写 `client.on('error', ...)` 会报 `client.on is not a function`。

- **修正**：不要监听 `error` 事件；用 `try/catch` 包裹 `client.connect(transport)` 与各 `client.callTool(...)`，错误信息从异常对象获取。

### 陷阱 2：写文件类工具默认被重定向到系统临时目录

`take_snapshot` / `take_screenshot` 等写文件工具，在 MCP 客户端**未协商 roots capability** 时，会被服务器强制重定向到 OS 临时目录，且日志提示 `File-writing tools will be restricted to the OS temp directory`，即使你传了其它路径也不落盘。

- **修正**：启动服务器时加 `--allow-unrestricted-paths`（mcp.json 的 args 中加入），关闭默认路径限制，文件才会落到你指定的目录。
- **触发条件**：仅当客户端未实现/未协商 MCP roots 时出现；若你的客户端已协商 roots，则无需此 flag。

### 陷阱 3：`take_snapshot` 的 `filePath` 是"保存目录"，文件名固定 `snapshot.txt`

- `take_snapshot` 的 `filePath` 实为**保存目录**，文件名由工具固定为 `snapshot.txt`（会忽略你给的文件名，例如给 `snapshot.html` 也会被忽略，落为 `snapshot.txt`）。返回内容同时会回显 `Saved snapshot to <目录>/snapshot.txt`。
- `take_screenshot` 的 `filePath` 则**正确作为完整文件路径**（含文件名与扩展名，如 `shot.png`）。

- **修正**：`take_snapshot` 传 `filePath` 时只给目录（如 `D:/tmp/_cdt_out`），检查该目录下生成的 `snapshot.txt`；`take_screenshot` 传完整文件路径。

---

## 模块 8：关键约束速查（本地化红线汇总）

- 复用登录态必须 `--browserUrl` 直连已启动实例；`--isolated` 默认临时 profile 会丢登录态。
- 浏览器用 `--executablePath` 而非 `--channel`（360Chromex 不在受支持 channel 列表）。
- 依赖安装务必 `PUPPETEER_SKIP_DOWNLOAD=1`，否则 puppeteer 会下载 Chromium（部署脚本已内置）。
- **严禁 `npx -y <pkg>`**：一律用 `node "$(npm root -g)/..."` 或 `npm install -g .`；本机全局根即 `$(npm root -g)`（随 Node 安装位置而定，切勿写死绝对路径）。
- 本机中文路径会导致 node/npm 失败；跨机移植请以 ASCII 路径的主副本为准，脚本均按脚本所在目录相对解析。
- `--categoryExtensions` 仅 pipe 连接支持；`--browserUrl` 模式暂不支持扩展工具（待上游 #149）。
- 本地化段以哨兵 `LOCALIZED:360Chromex` 标记；`--strip` 再注入可刷新，直接重跑则仅保全不刷新（兜底）。
