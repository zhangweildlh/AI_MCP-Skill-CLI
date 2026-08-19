<#
.SYNOPSIS
    修复 codebase-memory-mcp 的"祖先目录权限"，以满足上游的私有锁(private-lock)检查（上游文档 3.3.(c) 条）。

.DESCRIPTION
    使用方法：把这个脚本和 codebase-memory-mcp.exe 放在同一个文件夹里。
    脚本会从"自己所在的文件夹"开始，一级一级往上层目录走（每走一步就取父目录），
    对每一个"中间层"的祖先目录（注意：C:\、D:\、E:\ 这种盘符根目录是豁免的，不动它），
    重新生成一张干净、受保护的权限清单(ACL)，里面只保留下面这三个"该留下的"账户/组：

        * 系统账户 NT AUTHORITY\SYSTEM  —— 完全控制，且子文件夹和文件都自动继承  —— 因为 cbm 守护进程是以 SYSTEM 身份运行的
        * 管理员组 BUILTIN\Administrators —— 完全控制，且子文件夹和文件都自动继承 —— 方便管理员访问
        * 这个目录的所有者(owner)        —— 完全控制，但仅限本层、不往下继承        —— 也就是你当前这个用户

    除此之外，所有其他的权限条目(ACE)——比如"所有已登录用户(Authenticated Users S-1-5-11)"、
    "普通用户组(Users S-1-5-32-545)"、"所有人(Everyone S-1-1-0)"、跨账户单独授予的权限、
    以及那些已经删掉账户留下来的"幽灵编号(SID)"——统统删掉。

    这样做正好满足上游 3.3.(c) 的要求："任何中间祖先目录，都不能给其他账户（特别是 Authenticated Users）
    授予变更权限(0x00010)；盘符根目录本身豁免，但它顺着继承流到子目录里的那条权限并不豁免"。
    同时也满足上游的"碰头规则(rendezvous)"：目录必须归你或系统所有，不能给其他账户开允许(allow)权限。

    【范围说明】这个脚本只修"祖先目录"（从脚本目录往上走），不会往下动。
    缓存目录 data（上游文档 3.3.(a)）和每个 .db 文件（3.3.(b)）是由 cbm 自己以"仅所有者可访问"的方式创建的，
    它们位于脚本目录的"下层"，故意不在本脚本范围内（脚本从不向下走）。
    除了满足上游要求，本脚本不扩大也不缩小任何范围：最终权限清单精确就是 {SYSTEM、Administrators、所有者} 这三者，
    既保住了管理员/当前用户/SYSTEM 的访问权，又清掉了所有会触发私有锁检查的"其他账户"权限。

    【实现说明】早期版本用 FileSystemSecurity.PurgeAccessRules(IdentityReference) 来删权限，
    结果发现它没法可靠地把"广泛主体"的那几条权限真正从活动清单里删掉。
    所以本版本改成：直接用一组明确挑选好的规则，从头重建整张权限清单，结果确定、可控。

.PARAMETER DryRun
    只"报告"会改动什么，但不真去改任何权限。建议先跑一次这个，预览一下具体会动哪些目录、清掉哪些账户。

.EXAMPLE
    .\fix-acl-private-lock.ps1            # 真正动手修复
    .\fix-acl-private-lock.ps1 -DryRun    # 只预览，不改动
#>

# 让脚本支持 -DryRun 这种"开关参数"（不写就是真正执行，写上就是只预览不改动）
[CmdletBinding()]
param(
    # DryRun 开关：只预览会改什么，不动手改任何权限
    [switch]$DryRun
)

# 遇到任何错误就立刻停下，不再继续往下执行（宁可中断，也别把权限改坏）
$ErrorActionPreference = 'Stop'

# 脚本自己的所在目录（必须和 codebase-memory-mcp.exe 放在同一个文件夹里）
$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    # 极少数情况下取不到（比如特殊运行方式），就退而求其次：用脚本文件自身路径算出它的父目录
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
}

# 下面这两个"大老板"账户，无论什么时候都允许保留在权限清单里：
$systemSid = 'S-1-5-18'    # 系统账户 NT AUTHORITY\SYSTEM（Windows 自身和系统服务用的内置账户）
$adminSid  = 'S-1-5-32-544' # 管理员组 BUILTIN\Administrators（你这台电脑上的管理员们）

# 下面准备几组"继承/传播"开关——决定一条新规则是只管当前文件夹，还是自动传给里面的子文件夹和文件
$ci = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit  # 既管文件夹(容器)也管文件(对象)：子文件夹和里面的文件都自动继承这条规则
$noneInherit = [System.Security.AccessControl.InheritanceFlags]::None   # 不继承：这条规则只管当前这一层，不往下传
$noneProp = [System.Security.AccessControl.PropagationFlags]::None      # 不额外传播

# 一个小工具函数：把一个账户（可能是名字，也可能是 SID 编号）翻译成它唯一的 SID 编号字符串
function Get-SidValue {
    param([System.Security.Principal.IdentityReference]$ir)
    try {
        # 尝试翻译；Windows 里每个用户/组都有一串唯一编号(SID)，相当于它的身份证号
        return $ir.Translate([System.Security.Principal.SecurityIdentifier]).Value
    } catch {
        # 翻译失败（比如是个已经被删掉账户的"幽灵编号"），就返回空——后面会把它当作"违规账户"处理
        return $null
    }
}

# 判断一个路径是不是"盘符根目录"（比如 C:\、D:\），也就是没有更上层父目录的那一层
function Test-IsRoot {
    param([string]$path)
    try {
        $item = Get-Item -LiteralPath $path -Force
        # 没有父目录，说明它已经是盘的根了
        return ($null -eq $item.Parent)
    } catch {
        return $false
    }
}

# 另一个小工具函数：造一条"允许某账户对本文件夹完全控制（读写删改全干）"的权限规则
function New-FullControlRule {
    param(
        [System.Security.Principal.IdentityReference]$identity,
        [System.Security.AccessControl.InheritanceFlags]$inheritance,
        [System.Security.AccessControl.PropagationFlags]$propagation
    )
    # 最后那个 Allow 表示"允许"（而不是"拒绝"）；FullControl 表示完全控制
    return New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inheritance, $propagation, [System.Security.AccessControl.AccessControlType]::Allow)
}

# 从脚本所在目录开始，作为"当前要处理的目录"
$current = $scriptDir
$levels = 0   # 统计一共处理了多少层目录
$fixed = 0    # 统计"已修复"或"已确认本来就合规"的目录层数

# 先打印当前是哪种模式：真正执行，还是只预览
Write-Host ('[模式] ' + $(if ($DryRun) { '试运行（仅预览）' } else { '正式修复' }))
# 打印脚本从哪个目录开始
Write-Host ('[开始] 脚本所在目录：' + $scriptDir)

while ($true) {
    # 如果当前目录是盘符根目录，按上游规定直接跳过、不处理
    if (Test-IsRoot $current) {
        Write-Host ('[跳过] 盘符根目录不动：' + $current)
        break
    }

    $levels++
    Write-Host ('')
    Write-Host ('=== 第 ' + $levels + ' 层：' + $current + ' ===')

    # 读出这个目录当前的权限清单(ACL)——ACL 就是 Windows 给文件夹设的"谁有权、能干什么"的清单
    $acl = Get-Acl -LiteralPath $current
    # 取出这个目录的"所有者"(owner)——一般是创建它或拥有它的那个账户
    $ownerNta = $acl.GetOwner([System.Security.Principal.NTAccount])
    # 把所有者翻译成 SID 编号（如果所有者是个删掉的账户，这里会拿到空）
    $ownerSid = Get-SidValue $ownerNta

    # 先定好"允许留下"的账户清单：系统账户 + 管理员组 + (所有者，前提是该账户能识别、且不是前两个之一)
    $allowed = New-Object 'System.Collections.Generic.HashSet[string]'
    $allowed.Add($systemSid) | Out-Null
    $allowed.Add($adminSid) | Out-Null
    if ($ownerSid -ne $null) { $allowed.Add($ownerSid) | Out-Null }

    # 找出所有"违规"的权限条目(ACE)：只要某条权限对应的账户不在上面"允许留下"的清单里，就算违规。
    # 注意：无论是"继承来的"还是"自己显式设的"权限，只要账户不对就违规。
    # 那些翻译不出 SID 的"幽灵账户"（已删账户的残号）会返回空，自然也不在允许清单里，同样算违规。
    $offending = @()
    foreach ($rule in $acl.Access) {
        $sid = Get-SidValue $rule.IdentityReference
        $isAllowed = ($sid -ne $null) -and $allowed.Contains($sid)
        if (-not $isAllowed) {
            # 顺手标一下这条违规权限是"继承来的"还是自己设的，方便预览时看清楚
            $tag = if ($rule.IsInherited) { '（继承来的）' } else { '' }
            $offending += ($rule.IdentityReference.Value + $tag)
        }
    }

    # 如果没有任何违规权限，说明这个目录本来就已经符合要求了
    if ($offending.Count -eq 0) {
        Write-Host '  状态：权限清单已符合要求（仅 SYSTEM + 管理员组 + 所有者），无需改动'
        $fixed++
    } else {
        # 有违规权限：先列出要清理掉的有哪些
        Write-Host ('  将要清理的违规权限条目数：' + $offending.Count)
        $offending | Sort-Object -Unique | ForEach-Object { Write-Host ('    - ' + $_) }

        if (-not $DryRun) {
            # 真正动手：用"允许留下"的那几个账户，重新生成一张干净、受保护的权限清单(DACL)
            $newAcl = New-Object System.Security.AccessControl.DirectorySecurity
            # 设成"受保护"：丢弃所有从上层继承来的权限（不再让盘符根的权限顺流下来）
            $newAcl.SetAccessRuleProtection($true, $false)

            $sysId = New-Object System.Security.Principal.SecurityIdentifier($systemSid)
            $admId = New-Object System.Security.Principal.SecurityIdentifier($adminSid)
            # 加入系统账户（完全控制，子文件夹和文件都继承）
            $newAcl.AddAccessRule((New-FullControlRule $sysId $ci $noneProp))
            # 加入管理员组（完全控制，子文件夹和文件都继承）
            $newAcl.AddAccessRule((New-FullControlRule $admId $ci $noneProp))

            # 再加入所有者（仅本层、不继承），但前提是所有者不是系统账户或管理员组本身
            if (($ownerSid -ne $null) -and ($ownerSid -notin @($systemSid, $adminSid))) {
                $newAcl.AddAccessRule((New-FullControlRule $ownerNta $noneInherit $noneProp))
            }

            # 把这张新清单写到目录上，正式生效
            Set-Acl -LiteralPath $current -AclObject $newAcl
            $ownerLabel = if (($ownerSid -ne $null) -and ($ownerSid -notin @($systemSid, $adminSid))) { '，' + $ownerNta.Value } else { '' }
            Write-Host ('  已修复：' + $current + ' -> 保留的权限账户：SYSTEM、管理员组' + $ownerLabel)
        } else {
            Write-Host '  [试运行] 未做任何改动'
        }
        $fixed++
    }

    # 处理完这一层，往上走一级（取父目录），继续循环；如果已经没有更上层，就结束
    $parent = (Get-Item -LiteralPath $current -Force).Parent
    if ($null -eq $parent) { break }
    $current = $parent.FullName
}

Write-Host ('')
Write-Host '=== 完成 ==='
Write-Host ('共遍历目录层数：' + $levels + ' | 已修复/已确认合规层数：' + $fixed)
