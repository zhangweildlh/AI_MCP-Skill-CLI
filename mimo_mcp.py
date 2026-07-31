#!/usr/bin/env python3
"""
=============================================================================
  mimo-mcp v2.2.0  融合终版 — v2.1.0 架构规范 + 可观测性(metrics) + 默认超时上调至 900s
  （整合两版全部优势，修复双向全部已知 Bug，覆盖 22 项审计缺陷）
=============================================================================

 功能概述：
  - mimo.code   调用 MiMo Code 执行编程任务（代码读写、命令执行、Git 管理）
  - mimo.chat   直接调用 MiMo 大模型 API 对话（OpenAI 兼容格式）
  - mimo.health  健康检查（CLI 状态、API 连通性、openai 包状态、配置展示）

 环境变量（全部可选）：
  MIMO_API_KEY           MiMo API 密钥（优先读取，其次自动读 auth.json）
  MIMO_BASE_URL          API 基础地址，默认 https://api.xiaomimimo.com/v1
  MIMO_DEFAULT_MODEL     默认模型，默认 mimo-v2.5-pro
  MIMOCODE_BIN_PATH      mimo.exe 绝对路径，自动搜索失败时手动指定
  MIMOCODE_SEARCH_DIRS   额外搜索目录，分号分隔（Windows）/冒号（Unix）
  MIMO_NPM_GLOBAL_PATH   自定义 npm 全局目录根路径，适配 nvm/自定义 prefix
  MIMO_OPENAI_PATH       openai 包所在目录，包不在默认环境时用
  MIMO_AUTH_PATH         自定义 auth.json 绝对路径
  MIMO_CODE_TIMEOUT      mimo.code 执行超时秒数，默认 900（真实任务普遍 100–200s+，须 ≥ 实际耗时冗余）
  MIMO_CHAT_MAX_TOKENS   mimo.chat 单次最大输出 token，默认 4096
  MIMO_MCP_LOG_PATH      本地日志文件路径，留空则仅输出 stderr

 mcp.json 配置模板：
  {
    "mcpServers": {
      "mimo-mcp": {
        "command": "D:/Tools/Assembly/python/myenv/Scripts/python.exe",
        "args": ["D:/path/to/mimo_mcp.py"],
        "env": {
          "MIMO_API_KEY": "你的API Key",
          "MIMO_BASE_URL": "https://api.xiaomimimo.com/v1",
          "MIMO_DEFAULT_MODEL": "mimo-v2.5-pro",
          "MIMOCODE_BIN_PATH": "D:/path/to/mimo.exe",
          "MIMO_OPENAI_PATH": "D:/path/to/site-packages"
        }
      }
    }
  }

  命令选择建议（影响冷启动与握手稳定性）：
  - 推荐：直接用虚拟环境的 python 解释器（Windows 为 Scripts/python.exe，
    Linux/macOS 为 bin/python），跳过 `uv run` 的解析/启动开销，显著缩短 MCP 握手
    耗时——在 dmcp 等带握手超时/保活的中继形态下尤为关键，可避免握手阶段被强杀。
  - 备选：若依赖随项目走，也可 `command: "uv", args: ["run", "--project", "<venv>", "python", "mimo_mcp.py"]`。
  - 无论哪种，本脚本均不绑定具体路径/分组名/连接器，跨平台与跨 LLM 平台可移植。

 形态说明（本脚本同时服务两种接入形态，底层一致）：
  - 形态 B（宿主直连）：上述 mcp.json 由宿主平台（如 WorkBuddy 或其他 LLM 平台）直接拉起本脚本即可。
  - 形态 A（Dynamic-mcp 类中继，典型实现如 dmcp.exe）：在中继配置里把本脚本登记为一个 server group
    （group 名如 mimo-mcp），宿主平台通过中继暴露的动态工具入口（如 call_dynamic_tool，参数
    group + name:"mimo.code"）调用；中继自身往往也有超时/保活配置，须一并上调。无论哪种形态，
    底层都是同一份本脚本 + mimo.exe，可移植性不受影响。

=============================================================================
"""

import sys
import json
import os
import time
import subprocess
import threading
import queue
import logging
import shutil
import importlib.util
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple


# ===========================================================================
# 日志初始化（支持文件落盘 + stderr 双输出）
# ===========================================================================

_LOG_PATH = os.environ.get("MIMO_MCP_LOG_PATH", "").strip()
logger = logging.getLogger("mimo-mcp")
logger.setLevel(logging.INFO)
_log_fmt = logging.Formatter("%(asctime)s %(levelname)s: %(message)s")

if _LOG_PATH:
    try:
        _log_dir = os.path.dirname(_LOG_PATH)
        if _log_dir and os.access(_log_dir, os.W_OK):
            _fh = logging.FileHandler(_LOG_PATH, encoding="utf-8")
            _fh.setFormatter(_log_fmt)
            logger.addHandler(_fh)
    except Exception:
        pass

_sh = logging.StreamHandler(sys.stderr)
_sh.setFormatter(_log_fmt)
logger.addHandler(_sh)


# ===========================================================================
# Windows 编码兜底（双层覆盖：主进程 reconfigure + print 重写 + 子进程 env）
# ===========================================================================

def _safe_encode(text: str) -> str:
    """surrogateescape 编解码，保留原始字节不丢数据"""
    return text.encode("utf-8", errors="surrogateescape").decode("utf-8", errors="surrogateescape")


if sys.platform == "win32":
    # 第一层：reconfigure stdin/stdout 为 UTF-8
    try:
        sys.stdin.reconfigure(encoding="utf-8", errors="surrogateescape")
        sys.stdout.reconfigure(encoding="utf-8", errors="surrogateescape")
    except Exception:
        # 第二层：reconfigure 不可用时，重写 print 函数兜底主进程输出
        _original_print = print

        def _patched_print(*args, **kwargs):
            args = tuple(_safe_encode(str(a)) for a in args)
            _original_print(*args, **kwargs)

        print = _patched_print  # type: ignore[assignment]

    # 第三层：设置环境变量，让子进程也用 UTF-8 编码
    try:
        os.environ.setdefault("PYTHONIOENCODING", "utf-8:surrogateescape")
    except Exception:
        pass


# ===========================================================================
# OpenAI 可选导入 + 精准溯源
# ===========================================================================

def _inject_openai_path() -> None:
    """允许通过 MIMO_OPENAI_PATH 指定 openai 包所在目录"""
    custom = os.environ.get("MIMO_OPENAI_PATH", "").strip()
    if custom and os.path.isdir(custom) and custom not in sys.path:
        sys.path.insert(0, custom)
        log_msg = "openai 包路径已注入: %s" % custom
        logger.info(log_msg)


_inject_openai_path()

openai = None  # type: Any  # 占位，真实模块由 _ensure_openai() 懒加载填充
_OPENAI_AVAILABLE = False
OPENAI_LOAD_PATH = ""
_openai_cached = None  # type: Any


def _ensure_openai():
    """首次调用时懒加载 openai 包并缓存，之后复用。

    冷启动优化：mimo.code 主路径不依赖 openai，避免顶层 import 重型包
    （httpx/pydantic 依赖链）拖慢 MCP Server 启动，从而缩短 dmcp 冷启动窗口。
    """
    global openai, _OPENAI_AVAILABLE, OPENAI_LOAD_PATH, _openai_cached
    if _openai_cached is not None:
        return _openai_cached
    try:
        mod = importlib.import_module("openai")
        openai = mod
        _OPENAI_AVAILABLE = True
        _spec = importlib.util.find_spec("openai")
        if _spec and _spec.origin:
            OPENAI_LOAD_PATH = _spec.origin
        _openai_cached = mod
        return mod
    except ImportError:
        _OPENAI_AVAILABLE = False
        return None


# ===========================================================================
# 配置读取模块
# ===========================================================================

def get_api_key() -> Tuple[str, str]:
    """
    获取 MiMo API Key。
    返回 (key, source)，source 标识密钥来源：
      - "env:MIMO_API_KEY"  环境变量
      - "file:<path>"       本地 auth.json 文件
      - "none"              未配置
    """
    key = os.environ.get("MIMO_API_KEY", "").strip()
    if key:
        return key, "env:MIMO_API_KEY"

    auth_paths = _get_mimo_auth_paths()
    for auth_path in auth_paths:
        try:
            with open(auth_path, encoding="utf-8") as f:
                data = json.load(f)
                k = data.get("apiKey", "").strip()
                if k:
                    return k, "file:%s" % auth_path
        except Exception:
            continue

    return "", "none"


def _get_mimo_auth_paths() -> List[str]:
    """获取 MiMo Code 认证文件的可能路径（跨平台）"""
    env_auth = os.environ.get("MIMO_AUTH_PATH", "").strip()
    if env_auth and os.path.isfile(env_auth):
        return [env_auth]

    home = os.path.expanduser("~")
    paths = []

    if sys.platform == "win32":
        paths.extend([
            os.path.join(home, ".local", "share", "mimocode", "auth.json"),
            os.path.join(home, ".config", "mimocode", "auth.json"),
            os.path.join(home, "AppData", "Local", "mimocode", "auth.json"),
            os.path.join(home, "AppData", "Roaming", "mimocode", "auth.json"),
        ])
    elif sys.platform == "darwin":
        paths.extend([
            os.path.join(home, ".local", "share", "mimocode", "auth.json"),
            os.path.join(home, "Library", "Application Support", "mimocode", "auth.json"),
        ])
    else:
        paths.extend([
            os.path.join(home, ".local", "share", "mimocode", "auth.json"),
            os.path.join(home, ".config", "mimocode", "auth.json"),
        ])

    return paths


def get_base_url() -> str:
    return os.environ.get("MIMO_BASE_URL", "https://api.xiaomimimo.com/v1")


def get_default_model() -> str:
    return os.environ.get("MIMO_DEFAULT_MODEL", "mimo-v2.5")


def get_code_timeout() -> int:
    try:
        return int(os.environ.get("MIMO_CODE_TIMEOUT", "900"))
    except (ValueError, TypeError):
        return 900


def get_chat_max_tokens() -> int:
    try:
        return int(os.environ.get("MIMO_CHAT_MAX_TOKENS", "4096"))
    except (ValueError, TypeError):
        return 4096


# ===========================================================================
# MiMo Code CLI 定位（支持自定义 npm 全局目录）
# ===========================================================================

def find_mimo_exe() -> str:
    """
    查找 MiMo Code 原生二进制。搜索顺序：
      1. MIMOCODE_BIN_PATH（直接指定）
      2. MIMOCODE_SEARCH_DIRS（额外目录）
      3. npm 全局安装目录（支持 MIMO_NPM_GLOBAL_PATH 自定义）
      4. PATH 中的 mimo 命令
    """
    home = os.path.expanduser("~")

    # 1 环境变量直接指定
    env_path = os.environ.get("MIMOCODE_BIN_PATH", "").strip()
    if env_path and os.path.isfile(env_path):
        return env_path

    # 2 额外搜索目录
    extra_dirs = os.environ.get("MIMOCODE_SEARCH_DIRS", "").strip()
    if extra_dirs:
        for d in extra_dirs.split(os.pathsep):
            d = d.strip()
            if not d:
                continue
            exe_name = "mimo.exe" if sys.platform == "win32" else "mimo"
            exe_path = os.path.join(d, exe_name)
            if os.path.isfile(exe_path) and _is_executable(exe_path):
                return exe_path

    # 3 npm 全局安装目录（支持自定义 npm 根目录）
    candidates = []
    npm_global = os.environ.get("MIMO_NPM_GLOBAL_PATH", "").strip()

    if sys.platform == "win32":
        base_npm = npm_global if npm_global else os.path.join(home, "AppData", "Roaming", "npm")
        candidates.extend([
            os.path.join(base_npm, "node_modules", "@mimo-ai", "cli",
                         "node_modules", "@mimo-ai", "mimocode-windows-x64", "bin", "mimo.exe"),
            os.path.join(base_npm, "node_modules", "@mimo-ai", "cli",
                         "node_modules", "@mimo-ai", "mimocode-windows-arm64", "bin", "mimo.exe"),
        ])
    elif sys.platform == "darwin":
        base_npm = npm_global if npm_global else os.path.join(home, ".npm", "global", "lib")
        candidates.extend([
            os.path.join(base_npm, "node_modules", "@mimo-ai", "cli",
                         "node_modules", "@mimo-ai", "mimocode-darwin-arm64", "bin", "mimo"),
            os.path.join(base_npm, "node_modules", "@mimo-ai", "cli",
                         "node_modules", "@mimo-ai", "mimocode-darwin-x64", "bin", "mimo"),
            "/usr/local/lib/node_modules/@mimo-ai/cli/node_modules/"
            "@mimo-ai/mimocode-darwin-arm64/bin/mimo",
        ])
    else:
        base_npm = npm_global if npm_global else os.path.join(home, ".npm", "global", "lib")
        candidates.extend([
            os.path.join(base_npm, "node_modules", "@mimo-ai", "cli",
                         "node_modules", "@mimo-ai", "mimocode-linux-x64", "bin", "mimo"),
            "/usr/local/lib/node_modules/@mimo-ai/cli/node_modules/"
            "@mimo-ai/mimocode-linux-x64/bin/mimo",
        ])

    for c in candidates:
        if os.path.isfile(c) and _is_executable(c):
            return c

    # 4 PATH 兜底
    path_mimo = shutil.which("mimo")
    if path_mimo:
        return path_mimo

    return ""


def _is_executable(path: str) -> bool:
    if sys.platform == "win32":
        return True
    return os.access(path, os.X_OK)


# ===========================================================================
# 子进程上下文管理器（统一生命周期管控，自动回收）
# ===========================================================================

@contextmanager
def managed_subprocess(cmd: List[str], cwd: Optional[str] = None, timeout: int = 300):
    """
    统一子进程管理：创建 -> yield -> 自动回收。
    finally 中仅对仍在运行的进程执行 kill，避免误杀已正常退出的进程。
    """
    popen_kwargs: Dict[str, Any] = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "cwd": cwd,
        "encoding": "utf-8",
        "errors": "replace",
    }
    if sys.platform == "win32":
        popen_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    proc = subprocess.Popen(cmd, **popen_kwargs)
    try:
        yield proc
    finally:
        # 仅销毁仍在运行的进程（修复无条件 kill Bug）；Windows 优先杀进程树
        if proc.poll() is None:
            try:
                _kill_tree(proc.pid)
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        logger.debug("子进程 %d 资源回收完成" % proc.pid)


def _kill_tree(pid: int) -> None:
    """Windows 下杀掉整个进程树（父进程 + 所有子孙），避免孙进程持有 stdout 管道
    导致父进程 wait 挂起、进而突破 Python 超时上限触达 dmcp 超时并引发响应串台。
    仅 Windows 生效；类 Unix 由 managed_subprocess 的 CREATE_NEW_PROCESS_GROUP 配合
    SIGTERM 已覆盖。"""
    if sys.platform != "win32":
        return
    try:
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
    except Exception:
        pass


# ===========================================================================
# 工具参数校验器（独立可复用，支持单元测试）
# ===========================================================================

def validate_mimo_code_args(args: Dict) -> Optional[str]:
    """校验 mimo.code 参数，返回 None 表示通过，否则返回错误信息"""
    prompt = args.get("prompt", "")
    if not isinstance(prompt, str) or len(prompt.strip()) == 0:
        return "参数错误：prompt 不能为空字符串"

    # Windows cmd 命令行上限 8192，预留冗余取 7000
    if len(prompt) > 7000:
        return "参数错误：prompt 过长（%d 字符），上限 7000。Windows 命令行存在 8192 字符硬限制，超长会导致子进程创建失败，请缩短 prompt 或拆分为多次调用" % len(prompt)

    fmt = args.get("format", "text")
    if fmt not in ("text", "json"):
        return "参数错误：format 仅支持 text/json，传入了 %s" % fmt

    wd = args.get("working_dir", "")
    if wd:
        if not os.path.isdir(wd):
            return "参数错误：工作目录不存在 %s，禁止静默降级，请传入有效目录" % wd
        if not os.access(wd, os.R_OK | os.W_OK):
            return "参数错误：目录无读写权限 %s" % wd

    return None


def validate_mimo_chat_args(args: Dict) -> Optional[str]:
    """校验 mimo.chat 参数"""
    msgs = args.get("messages", [])
    if not isinstance(msgs, list) or len(msgs) == 0:
        return "参数错误：messages 不能为空数组"

    max_tok = args.get("max_tokens", 4096)
    if isinstance(max_tok, int) and max_tok <= 0:
        return "参数错误：max_tokens 必须大于 0，传入了 %d" % max_tok

    return None


# ===========================================================================
# 文本清洗（单次 surrogateescape，保留原始字节）
# ===========================================================================

def _sanitize(text: str) -> str:
    return text.encode("utf-8", errors="surrogateescape").decode("utf-8", errors="surrogateescape")


# ===========================================================================
# 队列读取（哨兵值机制，精确判断流结束）
# ===========================================================================

def _drain_queue(q: queue.Queue) -> List[str]:
    """
    从 queue 取出全部数据。读到哨兵 None 后继续排空剩余数据再退出，
    避免哨兵前残留数据被丢弃。
    """
    items: List[str] = []
    sentinel_seen = False
    while True:
        try:
            item = q.get_nowait()
            if item is None:
                sentinel_seen = True
                # 哨兵后可能还有残留数据，继续排空
                continue
            items.append(item)
        except queue.Empty:
            break
    return items


def _read_stream(stream: Any, q: queue.Queue, name: str) -> None:
    """线程安全地读取子进程流，写入 queue，结束时放入哨兵 None"""
    try:
        for line in stream:
            q.put(line)
    except Exception as e:
        logger.warning("%s 读取线程异常: %s" % (name, e))
    finally:
        q.put(None)  # 哨兵值：标记流读取结束


# ===========================================================================
# 事件流解析（过滤脏日志行，提取文本和 Token）
# ===========================================================================

def parse_mimo_stream(stdout_q: queue.Queue) -> Tuple[List[str], Optional[Dict]]:
    """
    从 queue 解析 MiMo JSON 事件流。
    使用 try/except queue.Empty 替代 queue.empty()，消除竞态条件。
    遇到哨兵 None 直接停止读取。
    """
    texts: List[str] = []
    tokens_info: Optional[Dict] = None

    while True:
        try:
            line = stdout_q.get_nowait()
        except queue.Empty:
            break

        # 哨兵值：流已结束
        if line is None:
            break

        line = line.strip()
        if not line:
            continue

        # 过滤非 JSON 脏日志行（版本提示、调试输出等）
        if not (line.startswith("{") and line.endswith("}")):
            continue

        try:
            evt = json.loads(line)
            etype = evt.get("type", "")

            if etype == "text":
                part = evt.get("part", {})
                t = part.get("text", "")
                if t:
                    texts.append(t)

            elif etype == "step_finish":
                part = evt.get("part", {})
                tk = part.get("tokens")
                if tk:
                    tokens_info = tk

        except json.JSONDecodeError:
            continue

    return texts, tokens_info


# ===========================================================================
# 子进程运行辅助（health 检查用）
# ===========================================================================

def _run_subprocess(cmd: list, timeout: int = 30) -> subprocess.CompletedProcess:
    kwargs: Dict[str, Any] = {
        "stdin": subprocess.DEVNULL,
        "capture_output": True,
        "text": True,
        "timeout": timeout,
        "encoding": "utf-8",
        "errors": "replace",
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    return subprocess.run(cmd, **kwargs)


# ===========================================================================
# MCP Server 主类
# ===========================================================================

class MimoMCPServer:
    """
    MiMo MCP Server — 将 MiMo Code 和 MiMo API 包装为 MCP 工具。

    v2.2.0 融合版：
      - 架构基底：v1.1.1 的 managed_subprocess / 独立校验 / importlib 溯源
      - 高容错：v2.0.0 的哨兵队列 / 5 类异常细分 / 全局异常兜底
      - Bug 修复：双方全部已知缺陷已修复
      - 可观测性：新增 mimo.metrics 工具，进程级统计调用/成功/失败/超时/错误与耗时
      - 默认超时：MIMO_CODE_TIMEOUT 由 300s 上调至 900s（匹配真实任务 100–200s+ 耗时）
      - 双形态：同一份脚本同时服务 形态A（dmcp 类中继）/ 形态B（宿主直连），底层无差异
    """

    VERSION = "2.2.0"

    def __init__(self):
        self.api_key, self.api_key_source = get_api_key()
        self.base_url = get_base_url()
        self.default_model = get_default_model()
        self.mimo_exe = find_mimo_exe()
        self.code_timeout = get_code_timeout()
        self.chat_max_tokens = get_chat_max_tokens()

        # 可观测性指标（进程级，dmcp/宿主重启则归零）：
        # 记录调用次数、成功/失败/超时/错误分类、累计与最大耗时、上次错误、进程启动时刻。
        # 暴露于 mimo.metrics 工具，供两接入形态（形态A 中继 / 形态B 直连）统一观测稳定性。
        self._metrics = {
            "calls": 0,
            "success": 0,
            "failed": 0,
            "timeouts": 0,
            "errors": 0,
            "total_ms": 0.0,
            "max_ms": 0.0,
            "last_error": None,
            "start_time": time.time(),
        }

        # OpenAI 客户端延迟构造：首次调用 mimo.chat / mimo.health 时才真正 import
        # 并构造，避免冷启动期加载重型 openai 包，缩短 dmcp 冷启动窗口。
        self.client = None

        # 轻量探测 openai 是否可导入（仅 find_spec 定位，不执行模块代码，
        # mimo.code 主路径不真正加载 openai），仅用于启动日志准确性。
        global _OPENAI_AVAILABLE, OPENAI_LOAD_PATH
        try:
            _spec = importlib.util.find_spec("openai")
            if _spec and _spec.origin:
                _OPENAI_AVAILABLE = True
                OPENAI_LOAD_PATH = _spec.origin
        except Exception:
            _OPENAI_AVAILABLE = False

        logger.info(
            "MCP Server 启动 | model=%s | exe=%s | api_key=%s | openai=%s",
            self.default_model,
            self.mimo_exe or "NOT FOUND",
            self.api_key_source,
            "available" if _OPENAI_AVAILABLE else "NOT INSTALLED",
        )

    # -----------------------------------------------------------------------
    # MCP 协议处理
    # -----------------------------------------------------------------------

    def handle_initialize(self, params: Dict) -> Dict:
        """MCP initialize 握手"""
        return {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {},
            },
            "serverInfo": {
                "name": "mimo-mcp",
                "version": self.VERSION,
            },
        }

    def handle_tools_list(self, params: Dict) -> Dict:
        """返回工具列表"""
        return {
            "tools": [
                {
                    "name": "mimo.code",
                    "description": (
                        "调用 MiMo Code（小米 AI 编程助手）执行编程任务。"
                        "MiMo Code 具备代码读写、命令执行、Git 管理等完整编码能力，"
                        "适合代码生成、重构、调试、项目分析等复杂编程场景。"
                        "基于 mimo run 非交互模式，自动完成任务后返回结果。"
                    ),
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "prompt": {
                                "type": "string",
                                "description": (
                                    "编程任务描述（最长 7000 字符）。"
                                    "如 '帮我写一个 Python 冒泡排序函数' 或 '分析当前项目的目录结构'。"
                                    "超长会导致 Windows 命令行溢出，建议拆分为多次调用。"
                                ),
                            },
                            "working_dir": {
                                "type": "string",
                                "description": (
                                    "工作目录（绝对路径）。MiMo Code 将在此目录下执行操作，"
                                    "留空使用当前项目目录。目录必须存在且可读写，不存在会直接报错。"
                                ),
                            },
                            "format": {
                                "type": "string",
                                "enum": ["text", "json"],
                                "default": "text",
                                "description": "输出格式：text=纯文本摘要（默认），json=完整 JSON 事件流",
                            },
                            "continue_session": {
                                "type": "boolean",
                                "default": False,
                                "description": "是否继续上一次会话上下文，默认 false",
                            },
                            "skip_permissions": {
                                "type": "boolean",
                                "default": False,
                                "description": "跳过权限确认（仅可信环境使用），默认 false",
                            },
                        },
                        "required": ["prompt"],
                    },
                },
                {
                    "name": "mimo.chat",
                    "description": (
                        "直接调用 MiMo 大模型 API 对话（OpenAI 兼容格式）。"
                        "适合简单问答、文本生成、翻译等轻量任务，不涉及文件操作。"
                    ),
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "messages": {
                                "type": "array",
                                "description": (
                                    "OpenAI 格式的消息列表，"
                                    "如 [{\"role\": \"user\", \"content\": \"你好\"}]"
                                ),
                            },
                            "model": {
                                "type": "string",
                                "default": "mimo-v2.5",
                                "description": "模型名称，默认 mimo-v2.5",
                            },
                            "max_tokens": {
                                "type": "integer",
                                "default": 4096,
                                "minimum": 1,
                                "description": "最大输出 token 数，默认 4096，必须大于 0",
                            },
                        },
                        "required": ["messages"],
                    },
                },
                {
                    "name": "mimo.health",
                    "description": (
                        "健康检查：返回 MiMo CLI 路径/版本、openai 包状态与物理路径、"
                        "API Key 来源、网络连通性、全部运行配置。"
                    ),
                    "inputSchema": {"type": "object", "properties": {}},
                },
                {
                    "name": "mimo.metrics",
                    "description": (
                        "可观测性指标：返回本进程自启动以来的调用统计与稳定性数据——"
                        "总调用次数、成功/失败/超时/错误分类计数、累计与最大单次耗时（毫秒）、"
                        "平均耗时、上次错误摘要、进程启动时刻、脚本版本与 mimo.exe 路径。"
                        "用于排查 mimo.code 稳定性问题（如超时风暴、频繁失败）。"
                        "注意：指标为进程级，dmcp 中继或宿主重启本进程后会归零。"
                    ),
                    "inputSchema": {"type": "object", "properties": {}},
                },
            ]
        }

    def handle_tools_call(self, params: Dict) -> Dict:
        """MCP tools/call 分发（顶层异常兜底，单工具崩溃不击穿主循环）"""
        tool_name = params.get("name", "")
        args = params.get("arguments", {})

        logger.info("工具调用: %s | args=%s" % (tool_name, json.dumps(args, ensure_ascii=False)[:200]))

        handlers = {
            "mimo.code": self._mimo_code,
            "mimo.chat": self._chat,
            "mimo.health": self._health,
            "mimo.metrics": self._metrics_tool,
        }

        handler = handlers.get(tool_name)
        if handler:
            try:
                return handler(args)
            except Exception as e:
                logger.error("工具 %s 执行异常: %s" % (tool_name, e), exc_info=True)
                return {
                    "content": [{"type": "text", "text": "工具执行异常: %s" % e}],
                    "isError": True,
                }

        return {
            "content": [{"type": "text", "text": "未知工具: %s" % tool_name}],
            "isError": True,
        }

    # -----------------------------------------------------------------------
    # 工具实现：mimo.code
    # -----------------------------------------------------------------------

    def _mimo_code(self, args: Dict) -> Dict:
        """
        计时与指标采集包装器；实际执行逻辑在 _mimo_code_inner。
        包装层负责：调用计数、累计/最大耗时（通用，所有返回路径统一生效）。
        分类计数（成功/失败/超时/错误）由 _mimo_code_inner 各返回分支精确累加，
        保证 calls == success + failed + timeouts + errors。
        """
        t0 = time.time()
        result = self._mimo_code_inner(args)
        elapsed = (time.time() - t0) * 1000.0
        self._metrics["calls"] += 1
        self._metrics["total_ms"] += elapsed
        if elapsed > self._metrics["max_ms"]:
            self._metrics["max_ms"] = elapsed
        return result

    def _mimo_code_inner(self, args: Dict) -> Dict:
        """
        通过 mimo.exe run 非交互模式执行编程任务。

        关键实现：
        - managed_subprocess 统一管理进程生命周期
        - -- 分隔符防止 prompt 被误解析为 CLI 参数
        - 哨兵值标记流结束，精确判断 IO 完整性
        - 超时前先 join 线程，保留已捕获输出
        """
        # 前置参数校验
        err = validate_mimo_code_args(args)
        if err:
            self._metrics["errors"] += 1
            self._metrics["last_error"] = "arg_invalid: %s" % err[:200]
            return {"content": [{"type": "text", "text": err}], "isError": True}

        if not self.mimo_exe:
            self._metrics["errors"] += 1
            self._metrics["last_error"] = "mimo_exe_not_found"
            return {
                "content": [{
                    "type": "text",
                    "text": (
                        "MiMo Code 未找到！请先安装：\n"
                        "  npm install -g @mimo-ai/cli\n"
                        "  然后运行 mimo 登录账号\n"
                        "如果已安装但仍找不到，请设置环境变量 MIMOCODE_BIN_PATH 指向 mimo.exe 路径"
                    ),
                }],
                "isError": True,
            }

        prompt = args["prompt"]
        wd = args.get("working_dir", "").strip()
        fmt = args.get("format", "text")
        cont = args.get("continue_session", False)
        skip_perm = args.get("skip_permissions", False)

        # 构建命令：-- 分隔符隔离 prompt，防止 --help 等 flag 逃逸
        cmd = [self.mimo_exe, "run", "--format", "json", "--", prompt]
        if cont:
            cmd.append("--continue")
        if skip_perm:
            cmd.append("--dangerously-skip-permissions")

        cwd = wd if wd else None
        stdout_q: queue.Queue = queue.Queue()
        stderr_q: queue.Queue = queue.Queue()

        logger.info("执行 mimo.code | timeout=%ds | cwd=%s" % (self.code_timeout, cwd or "(default)"))

        try:
            with managed_subprocess(cmd, cwd=cwd, timeout=self.code_timeout) as proc:
                t_out = threading.Thread(target=_read_stream, args=(proc.stdout, stdout_q, "stdout"), daemon=True)
                t_err = threading.Thread(target=_read_stream, args=(proc.stderr, stderr_q, "stderr"), daemon=True)
                t_out.start()
                t_err.start()

                # 等待进程完成
                try:
                    proc.wait(timeout=self.code_timeout)
                except subprocess.TimeoutExpired:
                    # 超时：先等线程读取已有数据，再杀掉整个进程树（含孙进程），
                    # 确保 mimo_mcp.py 在超时窗口内干净返回，避免突破 dmcp 超时引发串台。
                    logger.warning("mimo.code 超时（%ds），收集已捕获输出..." % self.code_timeout)
                    self._metrics["timeouts"] += 1
                    self._metrics["last_error"] = "timeout after %ds" % self.code_timeout
                    t_out.join(timeout=20)
                    t_err.join(timeout=20)
                    _kill_tree(proc.pid)
                    try:
                        proc.wait(timeout=5)
                    except Exception:
                        pass

                    # drain queue 保留已捕获的部分输出
                    partial = _drain_queue(stdout_q)
                    partial_text = "".join(partial).strip()

                    msg = "执行超时（%d 秒限制）" % self.code_timeout
                    if partial_text:
                        msg += "\n\n已捕获的部分输出（前 2000 字）：\n%s" % _sanitize(partial_text[:2000])
                    return {"content": [{"type": "text", "text": msg}], "isError": True}

                # 正常完成：等待线程读完流（哨兵值入队）
                t_out.join(timeout=30)
                t_err.join(timeout=30)

                # 检查退出码
                err_lines = _drain_queue(stderr_q)
                err_text = "".join(err_lines).strip()

                if proc.returncode != 0:
                    msg = err_text if err_text else "进程退出码 %d" % proc.returncode
                    logger.error("mimo.code 失败 | rc=%d | err=%s" % (proc.returncode, msg[:200]))
                    self._metrics["failed"] += 1
                    self._metrics["last_error"] = msg[:300]
                    return {"content": [{"type": "text", "text": "MiMo 执行失败: %s" % msg}], "isError": True}

                # JSON 模式：直接返回原始事件流
                if fmt == "json":
                    raw = _drain_queue(stdout_q)
                    full = _sanitize("".join(raw))
                    return {"content": [{"type": "text", "text": full}]}

                # Text 模式：解析事件流，提取文本和 Token 统计
                texts, tk_info = parse_mimo_stream(stdout_q)

                parts = []
                if texts:
                    parts.append(_sanitize("\n".join(texts)))
                if tk_info:
                    parts.append(
                        "\n--- Token 用量 ---\n"
                        "输入: %s  输出: %s  推理: %s  费用: $%s"
                        % (
                            tk_info.get("input", 0),
                            tk_info.get("output", 0),
                            tk_info.get("reasoning", 0),
                            tk_info.get("cost", 0),
                        )
                    )

                out_text = "\n".join(parts) if parts else "执行完成，无输出"
                self._metrics["success"] += 1
                return {"content": [{"type": "text", "text": out_text}]}

        except Exception as e:
            logger.error("mimo.code 异常: %s" % e, exc_info=True)
            self._metrics["errors"] += 1
            self._metrics["last_error"] = "runtime: %s" % str(e)[:300]
            return {
                "content": [{"type": "text", "text": "运行异常: %s" % str(e)}],
                "isError": True,
            }

    # -----------------------------------------------------------------------
    # 工具实现：mimo.metrics（可观测性）
    # -----------------------------------------------------------------------

    def _metrics_tool(self, _args: Dict) -> Dict:
        """返回进程级可观测性指标（详见 mimo.metrics 工具说明）。"""
        m = self._metrics
        calls = m["calls"]
        avg_ms = (m["total_ms"] / calls) if calls else 0.0
        uptime_s = time.time() - m["start_time"]
        stats = {
            "version": self.VERSION,
            "mimo_exe": self.mimo_exe,
            "code_timeout_s": self.code_timeout,
            "uptime_s": round(uptime_s, 1),
            "calls": calls,
            "success": m["success"],
            "failed": m["failed"],
            "timeouts": m["timeouts"],
            "errors": m["errors"],
            "success_rate": round(m["success"] / calls, 4) if calls else None,
            "total_ms": round(m["total_ms"], 1),
            "avg_ms": round(avg_ms, 1),
            "max_ms": round(m["max_ms"], 1),
            "last_error": m["last_error"],
        }
        text = json.dumps(stats, ensure_ascii=False, indent=2)
        return {"content": [{"type": "text", "text": text}]}

    # -----------------------------------------------------------------------
    # 工具实现：mimo.chat
    # -----------------------------------------------------------------------

    def _chat(self, args: Dict) -> Dict:
        """
        通过 OpenAI SDK 调用 MiMo API 对话。
        分层校验：openai 包 -> API Key -> 参数 -> 调用 -> 异常细分。
        openai 采用懒加载，首次调用时才 import。
        """
        # 前置参数校验
        err = validate_mimo_chat_args(args)
        if err:
            return {"content": [{"type": "text", "text": err}], "isError": True}

        # 分层检查：openai 包（懒加载） -> API Key
        oa = _ensure_openai()
        if oa is None:
            return {
                "content": [{
                    "type": "text",
                    "text": (
                        "openai 包未安装！请先安装依赖：\n"
                        "  uv add openai\n"
                        "  或 uv pip install openai\n"
                        "若包在自定义目录，请设置环境变量 MIMO_OPENAI_PATH 指向该目录"
                    ),
                }],
                "isError": True,
            }

        # 延迟构造 OpenAI 客户端（仅首次调用且密钥已配置时）
        if self.client is None and self.api_key:
            try:
                self.client = oa.OpenAI(api_key=self.api_key, base_url=self.base_url)
            except Exception as e:
                logger.warning("OpenAI 客户端初始化失败: %s" % e)
                return {
                    "content": [{
                        "type": "text",
                        "text": "OpenAI 客户端初始化失败: %s" % e,
                    }],
                    "isError": True,
                }

        if not self.client:
            return {
                "content": [{
                    "type": "text",
                    "text": "API Key 未配置，请设置环境变量 MIMO_API_KEY，或先运行 mimo 登录账号",
                }],
                "isError": True,
            }

        msgs = args["messages"]
        model = args.get("model", self.default_model)
        max_tok = args.get("max_tokens", self.chat_max_tokens)

        logger.info("mimo.chat | model=%s | max_tokens=%d | messages=%d" % (model, max_tok, len(msgs)))

        try:
            resp = self.client.chat.completions.create(
                model=model,
                messages=msgs,
                max_tokens=max_tok,
            )
            content = resp.choices[0].message.content or ""
            return {"content": [{"type": "text", "text": _sanitize(content)}]}

        except oa.AuthenticationError:
            return {
                "content": [{"type": "text", "text": "API Key 无效，请核对密钥配置"}],
                "isError": True,
            }
        except oa.RateLimitError:
            return {
                "content": [{"type": "text", "text": "请求频率超限，请稍后重试（免费额度可能有速率限制）"}],
                "isError": True,
            }
        except oa.APIConnectionError:
            return {
                "content": [{"type": "text", "text": "网络连接失败，请检查网络是否通畅，或 API 地址是否正确"}],
                "isError": True,
            }
        except oa.APITimeoutError:
            return {
                "content": [{"type": "text", "text": "API 请求超时，请稍后重试"}],
                "isError": True,
            }
        except Exception as e:
            logger.error("mimo.chat 异常: %s" % e, exc_info=True)
            return {
                "content": [{"type": "text", "text": "API 调用失败: %s" % str(e)}],
                "isError": True,
            }

    # -----------------------------------------------------------------------
    # 工具实现：mimo.health
    # -----------------------------------------------------------------------

    def _health(self, _args: Dict = None) -> Dict:
        """健康检查：CLI / openai / API Key / 网络 / 全量配置"""
        # 触发一次 openai 懒加载，确保状态准确
        oa = _ensure_openai()
        results: Dict[str, Any] = {
            "version": self.VERSION,
            "platform": sys.platform,
            "mimo_exe_path": self.mimo_exe or "NOT FOUND",
            "api_key_source": self.api_key_source,
            "api_key_prefix": self.api_key[:8] + "..." if self.api_key else "NONE",
            "base_url": self.base_url,
            "default_model": self.default_model,
            "code_timeout_seconds": self.code_timeout,
            "chat_max_tokens": self.chat_max_tokens,
            "openai_available": _OPENAI_AVAILABLE,
            "openai_load_path": OPENAI_LOAD_PATH if _OPENAI_AVAILABLE else "NOT INSTALLED",
            "openai_version": getattr(_openai_cached, "__version__", "unknown") if _OPENAI_AVAILABLE else "NONE",
        }

        # 检查 CLI 版本
        if self.mimo_exe:
            try:
                r = _run_subprocess([self.mimo_exe, "--version"], timeout=10)
                results["cli_version"] = r.stdout.strip() or "unknown"
                results["cli_status"] = "OK"
            except Exception as e:
                results["cli_status"] = "FAIL: %s" % e
        else:
            results["cli_status"] = "NOT INSTALLED - run: npm install -g @mimo-ai/cli"

        # 延迟构造 OpenAI 客户端（仅首次调用且密钥已配置时）
        if self.client is None and self.api_key and oa is not None:
            try:
                self.client = oa.OpenAI(api_key=self.api_key, base_url=self.base_url)
            except Exception as e:
                logger.warning("OpenAI 客户端初始化失败: %s" % e)

        # 检查 API 连通性（细分 5 类错误）
        if self.client:
            try:
                resp = self.client.chat.completions.create(
                    model=self.default_model,
                    messages=[{"role": "user", "content": "hi"}],
                    max_tokens=5,
                )
                results["api_status"] = "OK"
                raw = resp.choices[0].message.content or ""
                results["api_test_response"] = _sanitize(raw[:50])
            except oa.AuthenticationError:
                results["api_status"] = "AUTH FAILED - API Key 无效"
            except oa.RateLimitError:
                results["api_status"] = "RATE LIMITED - 请求频率超限"
            except oa.APIConnectionError:
                results["api_status"] = "CONNECTION FAILED - 网络不通或 API 地址错误"
            except oa.APITimeoutError:
                results["api_status"] = "TIMEOUT - API 请求超时"
            except Exception as e:
                results["api_status"] = "ERROR: %s" % e
        elif not _OPENAI_AVAILABLE:
            results["api_status"] = "BLOCKED - openai 包未安装"
        else:
            results["api_status"] = "BLOCKED - API Key 未配置"

        return {"content": [{"type": "text", "text": json.dumps(results, ensure_ascii=False, indent=2)}]}

    # -----------------------------------------------------------------------
    # MCP 主循环（多行 JSON 缓冲区，raw_decode 标准解析）
    # -----------------------------------------------------------------------

    def run(self):
        """
        MCP 主循环（异步模式）：读线程负责从 stdin 取行，工具调用在后台线程执行，
        主循环周期性醒来处理 inbound 请求与已完成的工具结果。
        关键点：tools/call 长任务（mimo run 可能耗时数十秒）在后台线程执行，
        主循环不被阻塞，连接器的 ping 健康检查可即时响应，避免连接超时重连。
        """
        logger.info("mimo-mcp v%s main loop started (async mode)" % self.VERSION)

        decoder = json.JSONDecoder()
        inbound: "queue.Queue" = queue.Queue()
        results: "queue.Queue" = queue.Queue()

        def _reader():
            try:
                for line in sys.stdin:
                    inbound.put(line)
            except Exception:
                pass
            finally:
                inbound.put(None)  # EOF 哨兵

        def _exec(req_id, params):
            """后台线程执行工具调用，结果回传 results 队列（不直接写 stdout）"""
            try:
                out = self.handle_tools_call(params)
                results.put((req_id, {"jsonrpc": "2.0", "id": req_id, "result": out}))
            except Exception as e:
                logger.error("工具执行异常: %s" % e, exc_info=True)
                results.put((req_id, {"jsonrpc": "2.0", "id": req_id, "result": {
                    "content": [{"type": "text", "text": "工具执行异常: %s" % e}],
                    "isError": True,
                }}))

        threading.Thread(target=_reader, daemon=True).start()

        buffer = ""
        while True:
            # 1) 先 flush 已完成的工具结果（非阻塞）
            while not results.empty():
                rid, resp = results.get_nowait()
                print(json.dumps(resp, ensure_ascii=False), flush=True)

            # 2) 取 inbound 请求（带超时，确保周期性响应 ping / flush 结果）
            try:
                item = inbound.get(timeout=0.2)
            except queue.Empty:
                continue
            if item is None:
                logger.info("stdin EOF，退出主循环")
                break

            buffer += item
            idx = 0
            buf_len = len(buffer)

            while idx < buf_len:
                # 跳过空白
                while idx < buf_len and buffer[idx] in " \t\n\r":
                    idx += 1
                if idx >= buf_len:
                    break

                try:
                    req, end_pos = decoder.raw_decode(buffer, idx)
                except json.JSONDecodeError:
                    # 剩余内容不完整，等待更多数据
                    break

                idx = end_pos

                method = req.get("method", "")
                req_id = req.get("id")
                params = req.get("params", {})

                if method == "notifications/initialized":
                    logger.info("客户端握手完成")
                    continue

                logger.debug("收到请求: method=%s id=%s" % (method, req_id))

                resp: Dict[str, Any] = {"jsonrpc": "2.0", "id": req_id}
                skip_print = False

                try:
                    if method == "initialize":
                        resp["result"] = self.handle_initialize(params)
                    elif method == "tools/list":
                        resp["result"] = self.handle_tools_list(params)
                    elif method == "tools/call":
                        # 长任务在后台线程执行，主循环不阻塞 → ping 可响应
                        threading.Thread(target=_exec, args=(req_id, params), daemon=True).start()
                        skip_print = True
                    elif method == "ping":
                        resp["result"] = {}
                    else:
                        resp["error"] = {"code": -32601, "message": "未知方法: %s" % method}
                except Exception as e:
                    logger.error("处理请求异常: method=%s error=%s" % (method, e), exc_info=True)
                    resp["error"] = {"code": -32000, "message": str(e)}

                if not skip_print:
                    print(json.dumps(resp, ensure_ascii=False), flush=True)

            # 截断已解析内容，保留未完整片段
            buffer = buffer[idx:]


# ===========================================================================
# 入口
# ===========================================================================

if __name__ == "__main__":
    server = MimoMCPServer()
    server.run()
