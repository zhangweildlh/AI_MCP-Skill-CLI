<#
.SYNOPSIS
    修复 codebase-memory-mcp（部署态）的 Windows 权限，使其满足上游
    DeusData/codebase-memory-mcp 的"私有目录 / 私有锁(private-lock)"安全校验，
    最终让 codebase-memory 守护进程能正常打开 _config.db 并启动。

.DESCRIPTION
    ───────────────────────────────────────────────────────────────────────
    一、为什么要修（本机实测出来的故障链）
    ───────────────────────────────────────────────────────────────────────
    本机把 UAC 从 0 改成 1 之后，当前用户的登录令牌变成了"过滤令牌"
    （filtered token）：虽然人是管理员，但令牌里不再带 Administrators 组，
    于是凡是"只有管理员能碰"的东西，当前用户都碰不到。

    与此同时，D:\codebase-memory-mcp\data 这个数据目录的权限条目(ACE)是
    老版本 v0.10.2 之前写下的：单条 ACE、受保护、当前用户完全控制，
    **但没有勾继承标志**（InheritanceFlags=None）。
    目录 ACE 不带继承 = 在里面新建的文件继承不到任何权限 = 空 DACL。
    空 DACL 的意思是"拒绝所有人"，连文件的所有者自己也被拒之门外。

    结果就是：data 目录下 9 个 .db 数据库文件（含最关键的 _config.db）
    全部变成"拒绝访问"。守护进程一启动就想读 _config.db，读不到就报
        daemon.runtime_config_open_failed reason=config_db_unavailable
        daemon.start_failed
    进程在 MCP 握手完成前就退出了，于是 dmcp 侧看到的就是那句
        Connection closed before receiving response

    上游 v0.10.3 之后其实自带了一个"自愈"逻辑（源码 src/daemon/ipc.c 的
    win_repair_runtime_children），但它要打开文件时申请
    READ_CONTROL | WRITE_DAC | WRITE_OWNER 三种权限——空 DACL 下连
    READ_CONTROL 都被拒绝，自愈自己也没法启动。所以必须由本脚本
    （以管理员身份）先把所有权抢回来，自愈才能接得上。

    ───────────────────────────────────────────────────────────────────────
    二、上游到底要求什么（依据：src/daemon/ipc.c + docs/CONFIGURATION.md）
    ───────────────────────────────────────────────────────────────────────
    上游用两套宽严不同的标准，本脚本严格照抄：

    【标准一：文件模板】（用于 .db、日志、exe 等"叶子"文件）
      * 所有者(owner)       = 精确的当前用户 SID
      * DACL 受保护(PROTECTED)，切断继承
      * 恰好 1 条 ACE：允许 当前用户 完全控制(GENERIC_ALL / FILE_ALL_ACCESS)
      * 不带继承标志
      依据：ipc.c 的 win_security_init() 里 security->acl 的构造（约 3947-3955 行），
            以及 win_file_dacl_is_owner_only() 的判定（约 4418-4452 行）。

    【标准二：目录模板】（用于 data、data\logs 等容器）
      * 所有者(owner)       = 精确的当前用户 SID
      * DACL 受保护(PROTECTED)
      * 恰好 1 条 ACE：允许 当前用户 完全控制
      * **必须带 CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE（子文件夹+文件都继承）**
      依据：ipc.c 的 security->directory_descriptor（约 3981-3996 行）。
      注意：目录这里必须用具体的 FILE_ALL_ACCESS，不能用 GENERIC_ALL——
      源码注释写明，Windows 会把"可继承的 generic 权限"拆成两条 ACE，
      而 owner-only 校验器要求"恰好 1 条 ACE"，拆开就判定失败。
      本脚本用 FileSystemRights::FullControl，其值正好是 0x1F01FF（FILE_ALL_ACCESS）。

    【标准三：祖先目录模板】（用于 D:\codebase-memory-mcp 及其各级父目录）
      * 不能给"不受信主体"授予变更权限(mutation rights)
      * 可信主体 = 当前用户、SYSTEM(S-1-5-18)、Administrators(S-1-5-32-544)、
        TrustedInstaller
      * 不受信主体 = Users、Authenticated Users、Everyone、Interactive、其他账户
      * 盘符根目录（如 D:\）豁免
      依据：ipc.c 的 win_sid_trusted()（约 4221 行）与
            win_directory_component_secure()（约 4679 行）。
      这一层允许 ACE 有多条，只要没有"不受信主体的变更权限"即可，
      所以本脚本在这一层保留 {SYSTEM、Administrators、所有者}，
      并**额外补一条当前用户的完全控制**（见下方"重要修正"）。

    ───────────────────────────────────────────────────────────────────────
    三、相对旧版脚本的三处重要修正（旧功能全部保留，只是补强）
    ───────────────────────────────────────────────────────────────────────
    修正 1｜作用域锚定到部署态
        旧版用 $PSScriptRoot（脚本自己所在目录）当起点。本脚本放在开发态目录
        D:\Documents\AI_MCP-Skill-CLI\... 下，照旧版跑就会去修开发态，
        而开发态是禁止直接使用的。现在默认锁定部署态 D:\codebase-memory-mcp。
        目标目录下必须存在 codebase-memory-mcp.exe，否则拒绝执行（安全阀）。

    修正 2｜祖先层补一条"当前用户 完全控制"，防止把自己锁在外面
        旧版在祖先层只保留 {SYSTEM、Administrators、所有者}。
        本机 D:\codebase-memory-mcp 的所有者是 BUILTIN\Administrators，
        当前用户原本只有"读取和执行"。如果照旧版清理，
        重建出来的清单里不会有当前用户（因为当前用户既不是 SYSTEM、
        也不是 Administrators、也不是所有者），再加上 UAC=1 的过滤令牌
        用不了 Administrators 那条——结果当前用户被彻底锁在门外，
        连 D:\codebase-memory-mcp 都进不去，守护进程更不可能写任何东西。
        现在显式追加"当前用户 完全控制（可继承）"。当前用户在上游
        判定里属于可信主体，加它不违反任何校验。

    修正 3｜新增"向下修"，覆盖主程序 / 数据文件 / 各级子目录
        旧版只往上修祖先，明确声明"从不向下走"。但本机真正的病根
        在下层（data 目录和 9 个 .db）。现在补齐：
          阶段 B：主程序 codebase-memory-mcp.exe（及安装目录下的其他文件）
          阶段 C：数据目录树（data 及所有子目录 + 所有文件）

    ───────────────────────────────────────────────────────────────────────
    四、执行顺序为什么是"先目录、后文件"
    ───────────────────────────────────────────────────────────────────────
    先把 data 及其子目录设成"带继承的 owner-only"，这样今后 cbm 新建的
    文件会自动继承到正确权限（这正是上游 #1531 修复的内容，是从根上断病根）；
    再把已经存在的、权限已经坏掉的文件逐个重打 owner-only。
    顺序颠倒的话，新建文件又会掉进空 DACL 的坑。

    ───────────────────────────────────────────────────────────────────────
    五、v3 加固记录（对外部审计报告逐项质证后落地 · 2026-09-10）
    ───────────────────────────────────────────────────────────────────────
    【严重项 · 已修】

    1) P/Invoke TOKEN_PRIVILEGES 结构布局错误（真实缺陷，原实现为静默失败）
       原结构为 `uint PrivilegeCount; long Luid; uint Attributes;`。
       C# 的 long 是 8 字节、且 .NET Sequential 布局默认按 8 字节对齐，
       于是 uint 之后会被插入 4 字节填充，Luid 实际落在偏移 8；
       而原生 TOKEN_PRIVILEGES 里 Privileges[0].Luid 位于偏移 4
       （LUID = DWORD LowPart + LONG HighPart，两个 4 字节字段，整体按 4 对齐）。
       实测旁证：BCL 既有结构 STATSTG 中，int(位于偏移 8) 之后紧跟的
       long cbSize 实测位于偏移 16（而非 12），证明该填充确实存在。
       后果：AdjustTokenPrivileges 从错误偏移读 LUID，返回值仍可能为真，
       但特权并未真正启用——即"看起来成功、实际什么都没做"的静默失败。
       现改为 LUID / LUID_AND_ATTRIBUTES / TOKEN_PRIVILEGES 三层结构，
       与原生定义逐字段一致；BufferLength 由 0 改为 Marshal.SizeOf(TOKEN_PRIVILEGES)。

    2) EnablePrivilege 返回值完全未检查（真实缺陷）
       现让 EnablePrivilege 返回 Win32 错误码：0=成功；1300=ERROR_NOT_ALL_ASSIGNED
       （令牌中根本不持有该特权）；其他=真实失败码。PowerShell 侧逐项检查，
       并区分"关键特权"(SeTakeOwnershipPrivilege) 与"辅助特权"(还原/备份)。
       注意：审计报告建议"任一失败即 exit 1"，本脚本**不采纳**——那会误杀
       "所有者已是当前用户、根本不需要夺权"这类完全可修的场景。
       现改为降级告警 + 记录状态，仅在真正需要该特权时才报明确错误。

    3) 阶段 C 遍历顺序错误（真实缺陷，会造成子目录漏修）
       原实现先 `Get-ChildItem -Recurse -Directory`，再修 data 根目录。
       若 data 本身是空 DACL/拒绝枚举，列表为空且错误被 SilentlyContinue 吞掉，
       子目录全部漏修；即使之后修好了 data，也不会回头重新枚举。
       现改为"先修本层 → 再枚举子项 → 递归"的自顶向下递归，
       并跳过重解析点(ReparsePoint)以防 junction/符号链接成环。

    【高危缺口 · 审计报告遗漏，本次补齐】

    4) 数据目录未做归属校验（原脚本对 -CacheDir 毫无约束）
       若误传 `-CacheDir C:\Windows`，脚本会对整棵系统目录重打 owner-only，
       后果不可逆。现强制要求数据目录必须位于安装目录之下，否则直接中止。
    5) 备份未检查 icacls 退出码：失败会被静默吞掉，用户误以为已有备份。

    【中低项 · 已修】

    6)  阶段 A 保留任意（可能不受信）所有者的完全控制 → 现仅在可信清单内授予，
        不可信则告警且不授予（不擅自改祖先目录的所有者）。
    7)  阶段 A 允许列表缺 TrustedInstaller SID → 已补，与注释保持一致。
    8)  阶段 A 的 Get-Acl / GetOwner 缺异常处理（会终止整个脚本）→
        现逐层 try/catch，失败只跳过该层并继续往上一层。
        （注：Set-PrivateOwnerOnly 中对应位置原本已在 try 内，无需改动。）
    9)  自提升参数拼接未转义单引号 → 已统一用单引号字面量转义函数处理。
    10) Add-Type -ErrorAction SilentlyContinue 掩盖编译错误 → 改为 Stop 并明确报错。
    11) icacls 备份路径基准未固定、且未说明不含所有者 → 现 Push-Location 固定基准，
        并明示"备份只含 DACL、不含所有者"。
    12) 阶段 A 未计入 stats.Ok（DryRun 分支也漏计）→ 已统一统计口径。
    13) 修改前未检测守护进程 → 现检测并告警；自动停止需显式加 -StopProcess。
        （不默认强杀：SQLite 未刷盘时强杀有损坏数据库的风险。）
    14) OpenProcessToken 句柄泄漏 → 已加 CloseHandle + try/finally。
    15) 提权日志未清理 → 保留（诊断证据）并打印路径，提示确认后可手动删除。
    16) 阶段 A 清理所有非白名单 ACE（连只读也清）→ 现只清理"不受信主体的
        变更类权限"，保留只读 ACE，避免影响共享父目录的其他用户。
    17) Write-Stat 的 $kind 参数未使用 → 现用于目录/文件分类统计。
    18) 阶段 A currentUserFull 只检查 ContainerInherit → 现要求
        ContainerInherit|ObjectInherit 全匹配，否则会误判"已合规"，
        导致目录下新建文件继承不到权限、空 DACL 复发（正是本次故障模式）。
    19) 阶段 A 重建 ACL 时未保留原主组(Group)与原所有者(owner) →
        现显式保留，避免在重写 DACL 的副作用中清空群组归属或所有者。

.PARAMETER InstallDir
    部署态安装目录。默认 D:\codebase-memory-mcp。
    强烈建议不要改——开发态目录禁止直接使用。

.PARAMETER CacheDir
    数据/缓存目录，对应环境变量 CBM_CACHE_DIR。默认取 <InstallDir>\data。
    安全约束：必须位于 InstallDir 之下，否则脚本直接中止。

.PARAMETER DryRun
    只报告会改什么，不真改。强烈建议先跑一次。

.PARAMETER SkipAncestors
    跳过"祖先目录"阶段（旧版原有功能）。

.PARAMETER SkipExe
    跳过"主程序及安装目录文件"阶段。

.PARAMETER SkipTree
    跳过"数据目录树"阶段。

.PARAMETER NoElevate
    不自动请求管理员权限。注意：非管理员下无法修复"拒绝访问"的 .db 文件。

.PARAMETER StopProcess
    检测到 codebase-memory-mcp / dmcp 进程运行时，先强制停止再修复。
    默认不停止（强杀有损坏 SQLite 数据库的风险），只告警。

.EXAMPLE
    .\修复codebase-memory-mcp的目录权限.ps1 -DryRun
        先预览，看清楚会动哪些东西。

.EXAMPLE
    .\修复codebase-memory-mcp的目录权限.ps1
        正式修复（会自动弹 UAC 请求管理员权限）。

.NOTES
    修复前会自动用 icacls 把当前权限备份到 %TEMP% 下。
    注意：备份只包含 DACL（权限清单），**不包含所有者**——
    因为本脚本会改变所有者，所以回滚后所有者需要另行处理。
    回滚方法：先切换到安装目录的父目录，再执行
        icacls <安装目录名> /restore <备份文件> /c
#>

[CmdletBinding()]
param(
    [string]$InstallDir = 'D:\codebase-memory-mcp',
    [string]$CacheDir   = '',
    [switch]$DryRun,
    [switch]$SkipAncestors,
    [switch]$SkipExe,
    [switch]$SkipTree,
    [switch]$NoElevate,
    [switch]$StopProcess
)

# 让控制台能正确显示中文（避免 PowerShell 5.1 下中文变乱码）
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'Stop'

# ═══════════════════════════════════════════════════════════════════════════
# 第 0 步：通用小工具
# ═══════════════════════════════════════════════════════════════════════════

# 把一个字符串转成 PowerShell 单引号字面量（其中的单引号翻倍转义）。
# 用途：拼装"提权子进程 runner 脚本"时，避免路径/参数里的单引号把语句拆断。
function ConvertTo-SingleQuotedLiteral {
    param([string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

# 把特权启用返回的 Win32 错误码翻译成人话
function Get-PrivilegeErrorText {
    param([int]$Code)
    switch ($Code) {
        0       { return '成功' }
        1300    { return 'ERROR_NOT_ALL_ASSIGNED(1300)：当前令牌不持有该特权（非管理员，或组策略已移除）' }
        5       { return 'ERROR_ACCESS_DENIED(5)：权限不足' }
        6       { return 'ERROR_INVALID_HANDLE(6)：令牌句柄无效' }
        87      { return 'ERROR_INVALID_PARAMETER(87)：参数无效（结构体布局不正确时会出现）' }
        default { return ('Win32 错误码 ' + $Code) }
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 第 1 步：管理员权限检查与自提升
# ═══════════════════════════════════════════════════════════════════════════
# 为什么要管理员：data\_config.db 现在是"空 DACL"，等于拒绝所有人。
# 普通用户连读权限都没有（Get-Acl 都会报"未经授权的操作"），
# 必须先凭借 SeTakeOwnershipPrivilege（取得所有权特权）把所有权抢回来，
# 变成所有者之后才有隐式权限去改它的权限清单。这个特权只有管理员有。

function Test-IsElevated {
    # 用 SID 'S-1-5-32-544'（内置的 Administrators 组）判断，
    # 不依赖可能被本地化的组名
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.SecurityIdentifier]'S-1-5-32-544')
}

$isElevated = Test-IsElevated

if (-not $isElevated) {
    if ($NoElevate) {
        Write-Host '[警告] 当前不是管理员权限。可以预览，但无法修复"拒绝访问"的数据文件。' -ForegroundColor Yellow
    } elseif ($DryRun) {
        Write-Host '[提示] DryRun 预览模式下不强制提升权限；读不到的对象会标记为"拒绝访问"。' -ForegroundColor Yellow
    } else {
        Write-Host '════════════════════════════════════════════════════' -ForegroundColor Cyan
        Write-Host ' 需要管理员权限才能修复被拒绝访问的数据文件(.db)。' -ForegroundColor Cyan
        Write-Host ' 即将请求 UAC 提升，请在弹窗中点击"是"。' -ForegroundColor Cyan
        Write-Host '════════════════════════════════════════════════════' -ForegroundColor Cyan
        # 组装透传给"提权子进程"的参数。
        # 加固点一：全部改用单引号字面量并转义其中的单引号，
        # 避免 InstallDir / CacheDir / 脚本路径中出现单引号时把 runner 脚本拆断。
        $innerParams = ''
        if ($InstallDir)    { $innerParams += ' -InstallDir '    + (ConvertTo-SingleQuotedLiteral $InstallDir) }
        if ($CacheDir)      { $innerParams += ' -CacheDir '      + (ConvertTo-SingleQuotedLiteral $CacheDir) }
        if ($DryRun)        { $innerParams += ' -DryRun' }
        if ($SkipAncestors) { $innerParams += ' -SkipAncestors' }
        if ($SkipExe)       { $innerParams += ' -SkipExe' }
        if ($SkipTree)      { $innerParams += ' -SkipTree' }
        if ($StopProcess)   { $innerParams += ' -StopProcess' }
        $innerParams += ' -NoElevate'   # 防止子进程再次自提升，形成无限递归

        # 用一个临时"运行器"脚本承接提权执行：它把子进程的完整输出写进日志文件，
        # 父进程等它跑完再读回来显示——这样既不会残留一个不关闭的窗口，
        # 也不会让用户看不到修复过程。
        $stamp      = Get-Date -Format 'yyyyMMdd-HHmmss'
        $logFile    = Join-Path $env:TEMP ('cbm-acl-fix-' + $stamp + '.log')
        $runnerFile = Join-Path $env:TEMP ('cbm-acl-runner-' + $stamp + '.ps1')
        $runnerText = '& ' + (ConvertTo-SingleQuotedLiteral $PSCommandPath) + $innerParams +
                      ' *>&1 | Out-File -LiteralPath ' + (ConvertTo-SingleQuotedLiteral $logFile) +
                      ' -Encoding UTF8' + "`r`n"
        [System.IO.File]::WriteAllText($runnerFile, $runnerText, (New-Object System.Text.UTF8Encoding($true)))

        try {
            Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait `
                -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $runnerFile + '"'))
            if (Test-Path -LiteralPath $logFile) {
                Write-Host ''
                Write-Host '--- 提权子进程的完整输出 ---'
                Get-Content -LiteralPath $logFile | ForEach-Object { Write-Host $_ }
                Write-Host ''
                Write-Host ('[日志] 完整日志已保留在：' + $logFile) -ForegroundColor Cyan
                Write-Host '       这是排障用的证据文件；确认不需要后可手动删除。' -ForegroundColor Cyan
            } else {
                Write-Host '[警告] 未找到提权子进程的日志文件，可能运行器脚本未被执行。' -ForegroundColor Yellow
                Write-Host ('       运行器脚本路径：' + $runnerFile) -ForegroundColor Yellow
                Write-Host ('       日志预期路径：' + $logFile) -ForegroundColor Yellow
            }
            Remove-Item -LiteralPath $runnerFile -Force -ErrorAction SilentlyContinue
            exit 0
        } catch {
            Write-Host ('[错误] 提升权限失败：' + $_.Exception.Message) -ForegroundColor Red
            Write-Host '       请手动以管理员身份打开 PowerShell，再运行本脚本。' -ForegroundColor Red
            Remove-Item -LiteralPath $runnerFile -Force -ErrorAction SilentlyContinue
            exit 1
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 第 2 步：注入 Windows 底层能力（P/Invoke）
# ═══════════════════════════════════════════════════════════════════════════
# 两件事 .NET 干不了，只能直接调 Windows API：
#   1) 开启"取得所有权"等特权
#   2) 对一个完全拒绝访问的文件强行设置所有者（绕过权限清单）
#
# 加固点（严重项 1）：TOKEN_PRIVILEGES 必须与原生定义逐字段一致。
#   原生：DWORD PrivilegeCount; LUID_AND_ATTRIBUTES Privileges[1];
#         LUID = { DWORD LowPart; LONG HighPart; }
#   若图省事写成 `uint + long`，.NET 会为 8 字节的 long 插入对齐填充，
#   使 LUID 落在偏移 8 而不是 4，AdjustTokenPrivileges 就会读错——
#   返回值可能仍为真，但特权根本没启用。
if (-not ('CbmSecurity.Native' -as [type])) {
    try {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CbmSecurity
{
    public static class Native
    {
        // 原生 LUID：两个 4 字节字段，整体按 4 字节对齐
        [StructLayout(LayoutKind.Sequential)]
        private struct LUID
        {
            public uint LowPart;
            public int  HighPart;
        }

        // 原生 LUID_AND_ATTRIBUTES：LUID(8B) + DWORD(4B)
        [StructLayout(LayoutKind.Sequential)]
        private struct LUID_AND_ATTRIBUTES
        {
            public LUID Luid;
            public uint Attributes;
        }

        // 原生 TOKEN_PRIVILEGES：DWORD + LUID_AND_ATTRIBUTES[1]
        // 用三层结构而非 uint+long 拼接，保证偏移与原生完全一致。
        [StructLayout(LayoutKind.Sequential)]
        private struct TOKEN_PRIVILEGES
        {
            public uint PrivilegeCount;
            public LUID_AND_ATTRIBUTES Privileges;
        }

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out LUID lpLuid);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges,
            ref TOKEN_PRIVILEGES NewState, uint BufferLength, IntPtr PreviousState, IntPtr ReturnLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
        private const uint TOKEN_QUERY = 0x0008;
        private const uint SE_PRIVILEGE_ENABLED = 0x00000002;

        /// <summary>
        /// 启用一个特权并返回 Win32 错误码（0 = 完全成功）。
        /// 关键点：AdjustTokenPrivileges 在"没有启用任何特权"时仍然返回真，
        ///        真正的结果只能靠 GetLastWin32Error 判断：
        ///        0    = 全部启用成功
        ///        1300 = ERROR_NOT_ALL_ASSIGNED，令牌中不持有该特权
        ///        其他 = 真实失败
        /// 句柄始终在 finally 中关闭，避免泄漏。
        /// </summary>
        public static int EnablePrivilege(string name)
        {
            IntPtr token = IntPtr.Zero;
            try
            {
                if (!OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle,
                        TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out token))
                {
                    return Marshal.GetLastWin32Error();
                }

                LUID luid;
                if (!LookupPrivilegeValue(null, name, out luid))
                {
                    return Marshal.GetLastWin32Error();
                }

                TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
                tp.PrivilegeCount = 1;
                tp.Privileges.Luid = luid;
                tp.Privileges.Attributes = SE_PRIVILEGE_ENABLED;

                // BufferLength 用结构体真实大小；此时 PreviousState 为 NULL，
                // 该参数本可传 0，但传准确值更不容易被后续修改踩坑。
                if (!AdjustTokenPrivileges(token, false, ref tp,
                        (uint)Marshal.SizeOf(typeof(TOKEN_PRIVILEGES)), IntPtr.Zero, IntPtr.Zero))
                {
                    return Marshal.GetLastWin32Error();
                }

                return Marshal.GetLastWin32Error();
            }
            finally
            {
                if (token != IntPtr.Zero) { CloseHandle(token); }
            }
        }

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern uint SetNamedSecurityInfo(
            string pObjectName, int ObjectType, uint SecurityInfo,
            IntPtr psidOwner, IntPtr psidGroup, IntPtr pDacl, IntPtr pSacl);

        private const int SE_FILE_OBJECT = 1;
        private const uint OWNER_SECURITY_INFORMATION = 0x00000001;

        /// <summary>
        /// 强行把某个文件/目录的所有者改成指定 SID。
        /// 只需要 SeTakeOwnershipPrivilege，不需要对该对象有任何现有权限——
        /// 这正是修复"空 DACL / 拒绝所有人"文件的关键入口。
        /// 返回 Win32 错误码，0 表示成功。
        /// </summary>
        public static uint TakeOwnership(string path, byte[] sidBinary)
        {
            IntPtr pSid = Marshal.AllocHGlobal(sidBinary.Length);
            try
            {
                Marshal.Copy(sidBinary, 0, pSid, sidBinary.Length);
                return SetNamedSecurityInfo(path, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION,
                    pSid, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
            }
            finally
            {
                Marshal.FreeHGlobal(pSid);
            }
        }
    }
}
'@ -ErrorAction Stop
    } catch {
        Write-Host ('[致命] 注入 Windows 底层能力失败：' + $_.Exception.Message) -ForegroundColor Red
        Write-Host '       本脚本必须依赖这段内联 C# 代码来开启特权并夺回所有权，无法继续。' -ForegroundColor Red
        Write-Host '       常见原因：PowerShell 版本过低、CodeDom 编译组件缺失、执行策略限制。' -ForegroundColor Red
        exit 1
    }
}

# 加固点（严重项 2）：逐项检查特权启用结果，并区分关键/辅助特权。
#   关键特权（取得所有权）失败 → 只有"必须夺权"的对象才会受影响，先告警；
#   辅助特权（还原/备份）失败 → 仅影响个别边缘情况，告警即可。
#   一律不 exit：因为"所有者本来就是当前用户"的场景根本不需要这些特权。
$script:privReady = @{ TakeOwnership = $false; Restore = $false; Backup = $false }
if ($isElevated) {
    $privPlan = @(
        @{ Name = 'SeTakeOwnershipPrivilege'; Key = 'TakeOwnership'; Text = '取得所有权'; Critical = $true  },
        @{ Name = 'SeRestorePrivilege';       Key = 'Restore';       Text = '还原';       Critical = $false },
        @{ Name = 'SeBackupPrivilege';        Key = 'Backup';        Text = '备份';       Critical = $false }
    )
    $okList   = @()
    $warnList = @()
    foreach ($p in $privPlan) {
        $rc = 0
        try { $rc = [int][CbmSecurity.Native]::EnablePrivilege($p.Name) }
        catch { $rc = -1 }
        if ($rc -eq 0) {
            $script:privReady[$p.Key] = $true
            $okList += $p.Text
        } else {
            $detail = Get-PrivilegeErrorText $rc
            $warnList += ('  [警告] ' + $p.Text + ' 特权未启用：' + $detail)
        }
    }
    if ($okList.Count -gt 0) {
        Write-Host ('[权限] 已开启：' + ($okList -join ' / ')) -ForegroundColor Green
    }
    foreach ($w in $warnList) { Write-Host $w -ForegroundColor Yellow }
    if (-not $script:privReady.TakeOwnership) {
        Write-Host '       （提示）"取得所有权"不可用时，本脚本仍能修复"所有者已是当前用户"的对象；' -ForegroundColor Yellow
        Write-Host '       只有"所有者是别的账户且拒绝访问"的文件会修复失败并明确报错。' -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 第 3 步：确定目标路径，并做安全自检
# ═══════════════════════════════════════════════════════════════════════════
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$currentSidBytes = New-Object byte[] $currentSid.BinaryLength
$currentSid.GetBinaryForm($currentSidBytes, 0)

if ([string]::IsNullOrWhiteSpace($CacheDir)) { $CacheDir = Join-Path $InstallDir 'data' }

Write-Host ('[模式] ' + $(if ($DryRun) { '试运行（只预览，不改动）' } else { '正式修复' }))
Write-Host ('[身份] 当前用户 ' + $currentSid.Translate([Security.Principal.NTAccount]).Value + '（SID ' + $currentSid.Value + '）')
Write-Host ('[身份] 管理员权限：' + $(if ($isElevated) { '是' } else { '否（只能预览）' }))
Write-Host ('[目标] 安装目录：' + $InstallDir)
Write-Host ('[目标] 数据目录：' + $CacheDir)

# 安全阀：目标必须是"部署态"，即安装目录下必须有真正的 codebase-memory-mcp.exe。
# 这样可以防止本脚本被误放到开发态目录后，跑去改开发态的权限。
$exePath = Join-Path $InstallDir 'codebase-memory-mcp.exe'
if (-not (Test-Path -LiteralPath $InstallDir -PathType Container)) {
    Write-Host ('[中止] 安装目录不存在：' + $InstallDir) -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    Write-Host ('[中止] 在目标目录下找不到主程序 codebase-memory-mcp.exe：' + $exePath) -ForegroundColor Red
    Write-Host '       这是防误操作的安全阀：请确认 -InstallDir 指向的是部署态目录。' -ForegroundColor Red
    exit 1
}
# 再挡一道：开发态目录禁止作为修复目标
if ($InstallDir -match 'AI_MCP-Skill-CLI') {
    Write-Host ('[中止] -InstallDir 指向了开发态目录（' + $InstallDir + '），开发态禁止直接使用。') -ForegroundColor Red
    exit 1
}
Write-Host '[自检] 目标目录校验通过（部署态）' -ForegroundColor Green

# 加固点（高危缺口）：数据目录归属校验。
#   阶段 C 会对数据目录整棵树重打 owner-only，一旦指向系统目录将造成不可逆破坏。
#   因此强制要求：数据目录必须位于安装目录之下。
$installFull = ''
$cacheFull   = ''
try { $installFull = (Get-Item -LiteralPath $InstallDir -Force).FullName.TrimEnd('\') } catch { $installFull = '' }
try { $cacheFull = [System.IO.Path]::GetFullPath($CacheDir).TrimEnd('\') } catch { $cacheFull = '' }

if ($installFull -eq '' -or $cacheFull -eq '') {
    Write-Host '[中止] 无法规范化安装目录或数据目录的绝对路径，出于安全考虑停止执行。' -ForegroundColor Red
    exit 1
}
if (-not $cacheFull.StartsWith($installFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Host '[中止] 数据目录不在安装目录之下，已拒绝执行（安全闸）。' -ForegroundColor Red
    Write-Host ('       安装目录：' + $installFull) -ForegroundColor Red
    Write-Host ('       数据目录：' + $cacheFull) -ForegroundColor Red
    Write-Host '       阶段 C 会对数据目录整棵树重打权限，指向系统目录将造成不可逆破坏。' -ForegroundColor Red
    Write-Host '       如确需修复其他位置，请显式修改 -CacheDir 并确认其位于 -InstallDir 之下。' -ForegroundColor Red
    exit 1
}
Write-Host '[自检] 数据目录归属校验通过（位于安装目录之下）' -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════════════
# 第 4 步：检测占用进程（只告警，不默认强杀）
# ═══════════════════════════════════════════════════════════════════════════
# 加固点：原脚本未做任何检测。守护进程若在运行，可能有文件句柄占用；
#         但 SetNamedSecurityInfo 改 DACL/所有者通常不需要独占访问，
#         真正的风险是"以其它账户运行的进程"与"未刷盘的 SQLite"。
#         因此默认只告警；要强制停止需显式加 -StopProcess。
$runningProcs = @()
try {
    $runningProcs = @(Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessName -match 'codebase-memory|dmcp' })
} catch { $runningProcs = @() }

if ($runningProcs.Count -gt 0) {
    Write-Host ''
    Write-Host '[提示] 检测到相关进程正在运行：' -ForegroundColor Yellow
    foreach ($p in $runningProcs) {
        Write-Host ('       - ' + $p.ProcessName + '（PID ' + $p.Id + '）') -ForegroundColor Yellow
    }
    if ($StopProcess -and -not $DryRun) {
        foreach ($p in $runningProcs) {
            try {
                Stop-Process -Id $p.Id -Force -ErrorAction Stop
                Write-Host ('       [已停止] ' + $p.ProcessName + '（PID ' + $p.Id + '）') -ForegroundColor Yellow
            } catch {
                Write-Host ('       [停止失败] ' + $p.ProcessName + '：' + $_.Exception.Message) -ForegroundColor Red
            }
        }
    } else {
        Write-Host '       建议先停止它们再正式修复；如需脚本代劳请加 -StopProcess。' -ForegroundColor Yellow
        Write-Host '       （不默认强杀：SQLite 未刷盘时强杀有损坏数据库的风险。）' -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 第 5 步：备份当前权限（便于出问题时回滚）
# ═══════════════════════════════════════════════════════════════════════════
# 加固点：icacls /save 记录的是"相对于当前工作目录"的路径，
#         所以必须在固定基准（安装目录的父目录）下执行，回滚路径才可复现；
#         并且 /save 只导 DACL，不含所有者，必须向用户讲清楚。
if (-not $DryRun) {
    $backupFile    = Join-Path $env:TEMP ('cbm-acl-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    $installParent = Split-Path -Path $InstallDir -Parent
    $installLeaf   = Split-Path -Path $InstallDir -Leaf
    $backupCode    = -1
    try {
        Push-Location -LiteralPath $installParent
        try {
            & icacls $installLeaf /save $backupFile /t /c /q 2>$null | Out-Null
            $backupCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
    } catch {
        $backupCode = -1
    }

    if ($backupCode -eq 0 -and (Test-Path -LiteralPath $backupFile)) {
        Write-Host ('[备份] 当前权限(DACL)已备份到：' + $backupFile) -ForegroundColor Green
        Write-Host ('       回滚方法：先 cd /d "' + $installParent + '"，再执行 icacls "' + $installLeaf + '" /restore "' + $backupFile + '" /c')
        Write-Host '       注意：备份只包含权限清单(DACL)，不包含所有者；本脚本会变更所有者，回滚后所有者需另行处理。' -ForegroundColor Yellow
    } else {
        Write-Host ('[警告] 权限备份失败（退出码 ' + $backupCode + '，不影响修复继续）。') -ForegroundColor Yellow
        Write-Host '       这意味着本次没有可用的回滚备份，请谨慎确认后再继续。' -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 第 6 步：通用工具函数
# ═══════════════════════════════════════════════════════════════════════════

# 几个固定不变的 SID（Windows 里每个账户/组的"身份证号"）
$systemSid = 'S-1-5-18'      # NT AUTHORITY\SYSTEM，系统自身
$adminSid  = 'S-1-5-32-544'  # BUILTIN\Administrators，管理员组
# TrustedInstaller：Windows 资源保护(WRP)的属主，属于上游认可的可信主体
$trustedInstallerSid = 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
# 祖先层"可信主体"白名单（上游 win_sid_trusted 的对应集合）
$trustedSids = @($systemSid, $adminSid, $currentSid.Value, $trustedInstallerSid)

# 继承/传播开关
$ci = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
$noneInherit = [System.Security.AccessControl.InheritanceFlags]::None
$noneProp = [System.Security.AccessControl.PropagationFlags]::None

# 加固点：祖先层只清理"不受信主体的变更类权限"，保留只读权限。
# 上游只要求"不受信主体没有变更权限"，本集合即"变更类权限"掩码。
$mutationRights =
    [System.Security.AccessControl.FileSystemRights]::WriteData -bor
    [System.Security.AccessControl.FileSystemRights]::AppendData -bor
    [System.Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::WriteAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [System.Security.AccessControl.FileSystemRights]::Delete -bor
    [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
    [System.Security.AccessControl.FileSystemRights]::TakeOwnership

# 把一个账户（名字或 SID）翻译成 SID 字符串；翻译失败（已删账户的"幽灵"）返回空
function Get-SidValue {
    param([System.Security.Principal.IdentityReference]$ir)
    try { return $ir.Translate([System.Security.Principal.SecurityIdentifier]).Value }
    catch { return $null }
}

# 判断是不是盘符根目录（C:\、D:\ 这种没有父目录的层）
function Test-IsRoot {
    param([string]$path)
    try {
        $item = Get-Item -LiteralPath $path -Force
        return ($null -eq $item.Parent)
    } catch { return $false }
}

# 造一条"允许某账户完全控制"的权限规则
function New-FullControlRule {
    param(
        [System.Security.Principal.IdentityReference]$identity,
        [System.Security.AccessControl.InheritanceFlags]$inheritance,
        [System.Security.AccessControl.PropagationFlags]$propagation
    )
    return New-Object System.Security.AccessControl.FileSystemAccessRule(
        $identity, 'FullControl', $inheritance, $propagation,
        [System.Security.AccessControl.AccessControlType]::Allow)
}

<#
 核心修复函数：把一个对象（文件或目录）改成"仅所有者可访问"的标准形态。
 这就是上游 win_security_init() 里那两个模板的 PowerShell 版：
   * 所有者 = 当前用户
   * DACL 受保护（切断继承）
   * 恰好 1 条 ACE：当前用户 完全控制
   * 目录额外带"子文件夹+文件都继承"标志，文件不带
#>
function Set-PrivateOwnerOnly {
    param(
        [string]$LiteralPath,
        [bool]$IsContainer,
        [switch]$DryRun
    )

    $result = [pscustomobject]@{ Path = $LiteralPath; Status = ''; Detail = '' }

    # —— 步骤 1：尝试读取当前权限清单。读不到（空 DACL）是预期内的，不算错。
    $acl = $null
    try { $acl = Get-Acl -LiteralPath $LiteralPath } catch { $acl = $null }

    # —— 步骤 2：判断所有者是不是当前用户；不是（或根本读不到）就强行抢过来
    $needTakeOwnership = $false
    if ($null -eq $acl) {
        $needTakeOwnership = $true
        $result.Detail = '当前拒绝访问（很可能是空 DACL），需要先夺回所有权'
    } else {
        try {
            $ownerSid = $acl.GetOwner([Security.Principal.SecurityIdentifier])
            if ($ownerSid.Value -ne $currentSid.Value) {
                $needTakeOwnership = $true
                $result.Detail = '所有者不是当前用户（现为 ' + (Get-SidValue $acl.GetOwner([System.Security.Principal.NTAccount])) + '）'
            }
        } catch {
            $needTakeOwnership = $true
            $result.Detail = '无法读取所有者，需要夺回所有权'
        }
    }

    # —— 步骤 3：逐条比对上游"仅所有者"标准，找出到底哪里不符合
    $needRedacl = $true
    $redaclReason = ''
    if ($null -ne $acl -and -not $needTakeOwnership) {
        $expectedInherit = if ($IsContainer) { $ci } else { $noneInherit }
        $protected = $acl.AreAccessRulesProtected
        $rules = @($acl.Access | Where-Object { -not $_.IsInherited })
        if (-not $protected) {
            $redaclReason = '权限清单未设"受保护"，仍会从上层继承权限'
        } elseif ($rules.Count -ne 1) {
            $redaclReason = '非继承的权限条目数为 ' + $rules.Count + ' 条，上游要求恰好 1 条'
        } else {
            $r = $rules[0]
            $sid = Get-SidValue $r.IdentityReference
            if ($sid -ne $currentSid.Value) {
                $redaclReason = '唯一权限条目的账户不是当前用户（现为 ' + $r.IdentityReference.Value + '）'
            } elseif ($r.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
                $redaclReason = '唯一权限条目不是"允许"类型'
            } elseif (($r.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne
                      [System.Security.AccessControl.FileSystemRights]::FullControl) {
                $redaclReason = '当前用户权限不足（现为 ' + $r.FileSystemRights + '，应为完全控制）'
            } elseif ($r.InheritanceFlags -ne $expectedInherit) {
                if ($IsContainer) {
                    $redaclReason = '目录权限条目缺少继承标志（现为 ' + $r.InheritanceFlags +
                                    '，应为 ContainerInherit,ObjectInherit）——这正是新建文件变成"拒绝访问"的根因'
                } else {
                    $redaclReason = '文件权限条目不应带继承标志（现为 ' + $r.InheritanceFlags + '）'
                }
            } else {
                $needRedacl = $false
            }
        }
    }

    if (-not $needTakeOwnership -and -not $needRedacl) {
        $result.Status = 'OK'
        $result.Detail = '已符合"仅所有者"标准'
        return $result
    }
    # owner 正确但清单不符时，把具体原因记下来，便于预览与排错
    if ([string]::IsNullOrEmpty($result.Detail) -and -not [string]::IsNullOrEmpty($redaclReason)) {
        $result.Detail = $redaclReason
    }

    if ($DryRun) {
        $result.Status = 'WOULD_FIX'
        return $result
    }

    # —— 步骤 4：抢所有权（需要管理员 + SeTakeOwnershipPrivilege）
    if ($needTakeOwnership) {
        if (-not $isElevated) {
            $result.Status = 'FAILED'
            $result.Detail = '需要管理员权限才能夺回所有权'
            return $result
        }
        if (-not $script:privReady.TakeOwnership) {
            $result.Status = 'FAILED'
            $result.Detail = '需要"取得所有权"特权，但该特权未能在当前令牌中启用（详见脚本开头的权限告警）'
            return $result
        }
        $rc = [CbmSecurity.Native]::TakeOwnership($LiteralPath, $currentSidBytes)
        if ($rc -ne 0) {
            $result.Status = 'FAILED'
            $result.Detail = '夺回所有权失败，Windows 错误码 ' + $rc
            return $result
        }
        # 成为所有者后，重新读一次权限清单（现在有隐式读权限了）
        try { $acl = Get-Acl -LiteralPath $LiteralPath } catch { $acl = $null }
    }

    # —— 步骤 5：重建"受保护的、仅当前用户完全控制"的权限清单
    try {
        if ($IsContainer) {
            $newAcl = New-Object System.Security.AccessControl.DirectorySecurity
            $inheritFlags = $ci
        } else {
            $newAcl = New-Object System.Security.AccessControl.FileSecurity
            $inheritFlags = $noneInherit
        }
        $newAcl.SetOwner($currentSid)
        # 加固点：显式保留原主组(Group)，避免重写安全描述符时把群组归属清空
        if ($null -ne $acl) {
            try { $newAcl.SetGroup($acl.GetGroup([System.Security.Principal.SecurityIdentifier])) } catch { }
        }
        $newAcl.SetAccessRuleProtection($true, $false)
        $newAcl.AddAccessRule((New-FullControlRule $currentSid $inheritFlags $noneProp))
        Set-Acl -LiteralPath $LiteralPath -AclObject $newAcl
        $result.Status = 'FIXED'
        $result.Detail = '所有者=当前用户；受保护；单条 ACE 当前用户完全控制' +
                         $(if ($IsContainer) { '（可继承）' } else { '' })
    } catch {
        $result.Status = 'FAILED'
        $result.Detail = '重建权限清单失败：' + $_.Exception.Message
    }
    return $result
}

# 阶段 C 专用：自顶向下递归修复目录树。
#   加固点（严重项 3）：必须先修本层、再枚举子项——
#   否则当父目录是空 DACL 时，递归枚举会失败（且错误被静默吞掉），
#   子目录会被整体漏修。
#   同时跳过重解析点(ReparsePoint)，避免顺着 junction / 符号链接绕成死循环。
function Repair-DirectoryTree {
    param(
        [string]$LiteralPath,
        [switch]$DryRun,
        [int]$Depth = 0
    )

    $r = Set-PrivateOwnerOnly -LiteralPath $LiteralPath -IsContainer $true -DryRun:$DryRun
    Write-Stat $r 'dir'

    if ($Depth -ge 64) {
        Write-Host ('  [警告] 目录层级超过 64 层，停止继续深入：' + $LiteralPath) -ForegroundColor Yellow
        return
    }

    $children = @()
    try {
        $children = @(Get-ChildItem -LiteralPath $LiteralPath -Force -Directory -ErrorAction SilentlyContinue |
            Where-Object {
                -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
            })
    } catch {
        Write-Host ('  [警告] 无法枚举子目录，已跳过：' + $LiteralPath + ' —— ' + $_.Exception.Message) -ForegroundColor Yellow
        return
    }

    foreach ($c in $children) {
        Repair-DirectoryTree -LiteralPath $c.FullName -DryRun:$DryRun -Depth ($Depth + 1)
    }
}

# 统计口径：总数 + 目录/文件分类
$script:stats = @{ Ok = 0; Fixed = 0; WouldFix = 0; Failed = 0 }
$script:kindStat = @{
    dir  = @{ Ok = 0; Fixed = 0; WouldFix = 0; Failed = 0 }
    file = @{ Ok = 0; Fixed = 0; WouldFix = 0; Failed = 0 }
}

# 加固点：$kind 不再是空转参数，用于目录/文件分类统计
function Write-Stat {
    param(
        $result,
        [ValidateSet('dir', 'file')]
        [string]$kind = 'file'
    )
    $k = $script:kindStat[$kind]
    switch ($result.Status) {
        'OK'        { $script:stats.Ok++;       $k.Ok++;       Write-Host ('  [已合规] ' + $result.Path) }
        'FIXED'     { $script:stats.Fixed++;    $k.Fixed++;    Write-Host ('  [已修复] ' + $result.Path + ' —— ' + $result.Detail) -ForegroundColor Green }
        'WOULD_FIX' { $script:stats.WouldFix++; $k.WouldFix++; Write-Host ('  [待修复] ' + $result.Path + ' —— ' + $result.Detail) -ForegroundColor Yellow }
        'FAILED'    { $script:stats.Failed++;   $k.Failed++;   Write-Host ('  [失败]   ' + $result.Path + ' —— ' + $result.Detail) -ForegroundColor Red }
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 阶段 A：祖先目录（旧版原有功能，完整保留 + 追加当前用户完全控制）
# ═══════════════════════════════════════════════════════════════════════════
if ($SkipAncestors) {
    Write-Host ''
    Write-Host '[阶段 A] 已跳过（祖先目录）'
} else {
    Write-Host ''
    Write-Host '══════════ 阶段 A：祖先目录（D:\codebase-memory-mcp 及以上） ══════════'
    Write-Host ' 规则：清掉"不受信主体"的变更类权限（只读权限保留），'
    Write-Host '       保留 SYSTEM + 管理员组 + TrustedInstaller + 所有者，'
    Write-Host '       并追加当前用户完全控制（防止 UAC=1 下把自己锁在门外）。'

    $current = $InstallDir
    $levels = 0
    $processed = 0

    while ($true) {
        if (Test-IsRoot $current) {
            Write-Host ('[跳过] 盘符根目录按上游规定豁免：' + $current)
            break
        }

        $levels++
        Write-Host ''
        Write-Host ('=== A-' + $levels + '：' + $current + ' ===')

        # 加固点（中等问题 8）：逐层做异常隔离。
        # 原实现直接 Get-Acl + GetOwner([NTAccount])，在 $ErrorActionPreference='Stop'
        # 之下，任何一层读不到 ACL 或所有者是"幽灵 SID"都会终止整个脚本，
        # 连后面的阶段 B/C 都跑不到。这里改成：本层失败只跳过本层，继续往上一层。
        $acl = $null
        try {
            $acl = Get-Acl -LiteralPath $current -ErrorAction Stop
        } catch {
            Write-Host ('  [跳过] 无法读取本层权限清单：' + $_.Exception.Message) -ForegroundColor Yellow
            $script:stats.Failed++
        }

        if ($null -ne $acl) {
            $ownerSid = $null
            $ownerNta = $null
            try { $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]) } catch { $ownerSid = $null }
            try { $ownerNta = $acl.GetOwner([System.Security.Principal.NTAccount]) } catch { $ownerNta = $null }

            # 允许留下的账户清单：SYSTEM + 管理员组 + 当前用户 + 所有者 + TrustedInstaller
            # 加固点（严重项 7）：补入 TrustedInstaller，与脚本注释保持一致性；
            # 否则祖先目录上原有的 TrustedInstaller ACE 会被误当成"违规"清掉。
            $allowed = New-Object 'System.Collections.Generic.HashSet[string]'
            $allowed.Add($systemSid) | Out-Null
            $allowed.Add($adminSid) | Out-Null
            $allowed.Add($currentSid.Value) | Out-Null
            $allowed.Add($trustedInstallerSid) | Out-Null
            if ($ownerSid -ne $null) { $allowed.Add($ownerSid.Value) | Out-Null }

            # 找出违规条目：
            # 加固点（低风险 16）：只把"不受信主体 + 持有变更类权限"判为违规。
            # 原实现把所有不在白名单的 ACE（含只读）都清掉，比上游要求更严，
            # 若祖先目录是共享目录会影响其他用户的只读访问。
            $offending = @()
            foreach ($rule in $acl.Access) {
                $sid = Get-SidValue $rule.IdentityReference
                if (($sid -eq $null) -or (-not $allowed.Contains($sid))) {
                    $hasMutation = (($rule.FileSystemRights -band $mutationRights) -ne
                                    [System.Security.AccessControl.FileSystemRights]::None)
                    if ($hasMutation) {
                        $tag = if ($rule.IsInherited) { '（继承来的）' } else { '' }
                        $offending += ($rule.IdentityReference.Value + '：' + $rule.FileSystemRights + $tag)
                    }
                }
            }

            # 还要检查：当前用户是否已经有"完全控制且可继承"的权限？没有就需要补
            # 加固点（低风险 18）：必须 ContainerInherit 与 ObjectInherit 同时具备。
            # 原实现只查 ContainerInherit，会把"缺 ObjectInherit"误判为已合规，
            # 于是不修——而缺 ObjectInherit 的目录下新建文件继承不到权限，
            # 空 DACL 会原样复发（正是本次故障的模式）。
            $currentUserFull = $false
            foreach ($rule in $acl.Access) {
                $sid = Get-SidValue $rule.IdentityReference
                if ($sid -eq $currentSid.Value -and
                    $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
                    ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq
                        [System.Security.AccessControl.FileSystemRights]::FullControl -and
                    (([int]$rule.InheritanceFlags -band [int]$ci) -eq [int]$ci)) {
                    $currentUserFull = $true
                }
            }

            if ($offending.Count -eq 0 -and $currentUserFull) {
                Write-Host '  状态：权限清单已符合要求，无需改动'
                # 加固点（中等问题 12）：统计口径统一——原实现只 $fixed++，
                # 从不计入 stats.Ok，导致汇总里"本来就合规"漏计阶段 A。
                $script:stats.Ok++
                $processed++
            } else {
                if ($offending.Count -gt 0) {
                    Write-Host ('  将要清理的违规权限条目数：' + $offending.Count)
                    $offending | Sort-Object -Unique | ForEach-Object { Write-Host ('    - ' + $_) }
                }
                if (-not $currentUserFull) {
                    Write-Host '  将要补充：当前用户 完全控制（子文件夹和文件都继承）'
                }

                if ($DryRun) {
                    Write-Host '  [试运行] 未做任何改动'
                    $script:stats.WouldFix++
                    $processed++
                } else {
                    $newAcl = New-Object System.Security.AccessControl.DirectorySecurity
                    # 加固点（新增 19）：显式保留原所有者与原主组，
                    # 避免重写安全描述符时把这两项清空。
                    try { $newAcl.SetOwner($acl.GetOwner([System.Security.Principal.SecurityIdentifier])) } catch { }
                    try { $newAcl.SetGroup($acl.GetGroup([System.Security.Principal.SecurityIdentifier])) } catch { }
                    $newAcl.SetAccessRuleProtection($true, $false)

                    $sysId = New-Object System.Security.Principal.SecurityIdentifier($systemSid)
                    $admId = New-Object System.Security.Principal.SecurityIdentifier($adminSid)
                    $tiId  = New-Object System.Security.Principal.SecurityIdentifier($trustedInstallerSid)
                    $newAcl.AddAccessRule((New-FullControlRule $sysId $ci $noneProp))
                    $newAcl.AddAccessRule((New-FullControlRule $admId $ci $noneProp))
                    $newAcl.AddAccessRule((New-FullControlRule $tiId  $ci $noneProp))

                    # 所有者（仅本层、不继承）。
                    # 加固点（严重项 6）：仅在"可信主体"清单内才授予。
                    # 原实现只要所有者不是 SYSTEM/Administrators/当前用户 就无条件授予完全控制，
                    # 若所有者是不受信账户，反而会造出上游 win_directory_component_secure()
                    # 判定为不安全的一层。这里对不可信所有者不授予，并给出告警。
                    if (($ownerSid -ne $null) -and ($ownerSid.Value -notin @($systemSid, $adminSid, $currentSid.Value))) {
                        if ($ownerSid.Value -in $trustedSids) {
                            $ownerRef = if ($ownerNta -ne $null) { $ownerNta } else { $ownerSid }
                            $newAcl.AddAccessRule((New-FullControlRule $ownerRef $noneInherit $noneProp))
                        } else {
                            Write-Host ('  [告警] 本层所有者不属于可信主体，未向其授予权限：' + $ownerSid.Value) -ForegroundColor Yellow
                            Write-Host '         如上游校验仍不通过，请人工确认该层所有者的归属。' -ForegroundColor Yellow
                        }
                    }
                    # 关键修正：追加当前用户完全控制（可继承）
                    $newAcl.AddAccessRule((New-FullControlRule $currentSid $ci $noneProp))

                    Set-Acl -LiteralPath $current -AclObject $newAcl
                    $keptOwner = ''
                    if (($ownerSid -ne $null) -and ($ownerSid.Value -notin @($systemSid, $adminSid, $currentSid.Value)) -and ($ownerSid.Value -in $trustedSids)) {
                        $keptOwner = '、' + $ownerSid.Value
                    }
                    Write-Host ('  已修复：' + $current + ' -> 保留 SYSTEM、管理员组、TrustedInstaller、当前用户' + $keptOwner) -ForegroundColor Green
                    $script:stats.Fixed++
                    $processed++
                }
            }
        }

        $parent = $null
        try { $parent = (Get-Item -LiteralPath $current -Force).Parent } catch { $parent = $null }
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
    Write-Host ''
    Write-Host ('[阶段 A] 共遍历 ' + $levels + ' 层，已处理/已合规 ' + $processed + ' 层')
}

# ═══════════════════════════════════════════════════════════════════════════
# 阶段 B：主程序及安装目录下的文件
# ═══════════════════════════════════════════════════════════════════════════
if ($SkipExe) {
    Write-Host ''
    Write-Host '[阶段 B] 已跳过（主程序）'
} else {
    Write-Host ''
    Write-Host '══════════ 阶段 B：主程序 codebase-memory-mcp.exe 及安装目录文件 ══════════'
    Write-Host ' 说明：上游源码并不校验 exe 自身的权限（ipc.c 中无任何 .exe 校验），'
    Write-Host '       这里按上游"文件模板"统一加固：所有者=当前用户、受保护、'
    Write-Host '       单条 ACE 完全控制。既能防止被别的账户篡改，也保证 cbm 自更新可用。'
    Write-Host ' 注意：本阶段会把 exe 收敛为"仅当前用户可访问"。若日后改为由 SYSTEM 或'
    Write-Host '       其他服务账户启动 cbm，该账户将无法读取 exe，需要重新调整这一层。'

    $files = @(Get-ChildItem -LiteralPath $InstallDir -Force -File -ErrorAction SilentlyContinue)
    # 把主程序排在最前面，优先处理
    $files = @($files | Sort-Object { if ($_.Name -eq 'codebase-memory-mcp.exe') { 0 } else { 1 } })
    foreach ($f in $files) {
        $r = Set-PrivateOwnerOnly -LiteralPath $f.FullName -IsContainer $false -DryRun:$DryRun
        Write-Stat $r 'file'
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 阶段 C：数据目录树（data 及所有子目录 + 所有文件）
# ═══════════════════════════════════════════════════════════════════════════
if ($SkipTree) {
    Write-Host ''
    Write-Host '[阶段 C] 已跳过（数据目录树）'
} elseif (-not (Test-Path -LiteralPath $CacheDir -PathType Container)) {
    Write-Host ''
    Write-Host ('[阶段 C] 数据目录不存在，跳过：' + $CacheDir)
} else {
    Write-Host ''
    Write-Host ('══════════ 阶段 C：数据目录树 ' + $CacheDir + ' ══════════')
    Write-Host ' 顺序：先目录（带继承，断病根）→ 后文件（逐个重打权限）'

    # —— C-1：目录（含 data 本身），自顶向下递归 ——
    # 加固点（严重项 3）：改为"先修本层 → 再枚举子项 → 递归"。
    # 原实现先一次性 Get-ChildItem -Recurse -Directory 再修 data 根目录：
    # 若 data 本身是空 DACL，枚举会失败且被 -ErrorAction SilentlyContinue 吞掉，
    # 结果子目录全部漏修，且修好 data 之后也不会回头重新枚举。
    Write-Host ''
    Write-Host '--- C-1 目录（模板：所有者=当前用户，受保护，单条 ACE 完全控制 + 可继承）---'
    Repair-DirectoryTree -LiteralPath $CacheDir -DryRun:$DryRun

    # —— C-2：文件（含 9 个 .db 和 logs 下所有日志） ——
    # 放在目录修好之后枚举，确保权限已恢复、能正常列出文件。
    Write-Host ''
    Write-Host '--- C-2 文件（模板：所有者=当前用户，受保护，单条 ACE 完全控制，不继承）---'
    $treeFiles = @(Get-ChildItem -LiteralPath $CacheDir -Force -Recurse -File -ErrorAction SilentlyContinue)
    # _config.db 是最关键的（守护进程启动就要读它），排最前面先修
    $treeFiles = @($treeFiles | Sort-Object { if ($_.Name -eq '_config.db') { 0 } else { 1 } })
    if ($treeFiles.Count -eq 0) {
        Write-Host '  [提示] 未枚举到任何文件。若数据目录下确实应有文件，请确认权限是否已恢复。' -ForegroundColor Yellow
    }
    foreach ($f in $treeFiles) {
        $r = Set-PrivateOwnerOnly -LiteralPath $f.FullName -IsContainer $false -DryRun:$DryRun
        Write-Stat $r 'file'
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# 收尾：汇总与验证
# ═══════════════════════════════════════════════════════════════════════════
Write-Host ''
Write-Host '═══════════════════ 汇总 ═══════════════════'
Write-Host ('  本来就合规：' + $script:stats.Ok +
            '  （目录 ' + $script:kindStat.dir.Ok + ' / 文件 ' + $script:kindStat.file.Ok + '）')
Write-Host ('  本次已修复：' + $script:stats.Fixed +
            '  （目录 ' + $script:kindStat.dir.Fixed + ' / 文件 ' + $script:kindStat.file.Fixed + '）')
Write-Host ('  待修复(预览)：' + $script:stats.WouldFix)
Write-Host ('  失败：' + $script:stats.Failed)

if (-not $DryRun) {
    Write-Host ''
    Write-Host '--- 验证：检查 data 目录是否可正常访问 ---'
    $probe = Join-Path $CacheDir '_config.db'
    if (Test-Path -LiteralPath $probe) {
        try {
            $a = Get-Acl -LiteralPath $probe
            $o = $a.GetOwner([Security.Principal.NTAccount]).Value
            Write-Host ('  _config.db 可以读取权限清单了，所有者 = ' + $o) -ForegroundColor Green
        } catch {
            Write-Host ('  _config.db 仍然拒绝访问：' + $_.Exception.Message) -ForegroundColor Red
        }
    } else {
        Write-Host '  未找到 _config.db（首次运行时会由 cbm 自动创建）'
    }
    Write-Host ''
    Write-Host '下一步：重启 dmcp（或重启调用方），再确认 codebase-memory-mcp 是否连接成功。' -ForegroundColor Cyan
} else {
    Write-Host ''
    Write-Host '这是试运行预览，未做任何改动。确认无误后去掉 -DryRun 再跑一次正式修复。' -ForegroundColor Cyan
}
