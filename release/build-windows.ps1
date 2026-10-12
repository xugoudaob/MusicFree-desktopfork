#requires -Version 5
<#
.SYNOPSIS
    用 Inno Setup 生成 MusicFree 的 Windows 安装包（release/build-windows.iss）。

.DESCRIPTION
    版本号只有一个来源：package.json。脚本读它并以 /DMyAppVersion= 传给 ISCC，
    避免落到 build-windows.iss 里 #ifndef 那个写死的兜底值。
    （CI 走 .github/workflows/build.yml 的 inno-setup-action 时同理。）

    前置：先跑过 `pnpm run package`，让 out\MusicFree-win32-x64\ 存在。
    （通过 forge 的 postMake 钩子调用时，package 已自动完成。）

.PARAMETER AppId
    MyAppId（安装包身份，升级识别用）。默认读环境变量 MYAPPID。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File release\build-windows.ps1
    powershell -ExecutionPolicy Bypass -File release\build-windows.ps1 -AppId 8b1c...-...
#>
param(
    [string]$AppId = $env:MYAPPID
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot          # release\ 的上一级 = 仓库根
$pkgPath  = Join-Path $repoRoot 'package.json'
$issPath  = Join-Path $PSScriptRoot 'build-windows.iss'

# 1) 版本号：唯一来源 package.json
if (-not (Test-Path $pkgPath)) { throw "找不到 $pkgPath" }
$version = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($version)) { throw "package.json 里读不到 version" }

# 2) AppId 必须显式给出：.iss 里是 #ifndef，#define MyAppId 为空会生成 AppId={} 的壳
if ([string]::IsNullOrWhiteSpace($AppId)) {
    throw "缺少 MyAppId。请先设置环境变量 MYAPPID，或用 -AppId <GUID> 传入。"
}

# 3) 定位 ISCC.exe：先 PATH，再常见安装位置
$iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
if (-not $iscc) {
    # 注意：${env:ProgramFiles(x86)} 在部分环境为空，Join-Path 遇到空值会抛，故逐个判空
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe') }
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe') }
    $iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $iscc) {
    throw "找不到 ISCC.exe。请安装 Inno Setup 6（winget install JRSoftware.InnoSetup），或把 ISCC.exe 加进 PATH。"
}

# 4) 打前检查：安装包要打包产物存在
$appExe = Join-Path $repoRoot 'out\MusicFree-win32-x64\MusicFree.exe'
if (-not (Test-Path $appExe)) {
    throw "找不到 $appExe。请先执行 pnpm run package 生成打包产物。"
}

Write-Host "[build-windows] 版本   : $version"
Write-Host "[build-windows] ISCC   : $iscc"
Write-Host "[build-windows] 脚本   : $issPath"
Write-Host "[build-windows] AppId  : $AppId"

# 5) 调 ISCC（/D 覆盖 .iss 里 #ifndef 的兜底值）
#    注意：EAP=Stop 时，原生命令往 stderr 写内容会被当成 NativeCommandError 抛出，
#    而 ISCC 打印警告是走 stderr 的，所以这里临时降为 Continue，靠退出码判成败。
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $iscc "/DMyAppVersion=$version" "/DMyAppId=$AppId" $issPath
$isccExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($isccExit -ne 0) { throw "ISCC 失败，退出码 $isccExit" }

$setupExe = Join-Path $repoRoot 'out\MusicFreeSetup.exe'
if (Test-Path $setupExe) {
    Write-Host "[build-windows] OK -> $setupExe"
}
else {
    Write-Warning "[build-windows] ISCC 返回 0，但没找到 $setupExe，请检查 .iss 的 OutputDir/OutputBaseFilename"
}
