@echo off
REM ---------------------------------------------------------------------------
REM  MusicFree Windows 安装包构建（薄封装，真正逻辑在 build-windows.ps1）
REM  版本号自动取自 package.json，无需手敲 /DMyAppVersion
REM
REM  用法：
REM      release\build-windows.bat
REM  前置：
REM      pnpm run package      （先生成 out\MusicFree-win32-x64\）
REM      set MYAPPID=<GUID>    （Inno Setup 的 AppId，升级识别用）
REM ---------------------------------------------------------------------------
setlocal

if "%MYAPPID%"=="" (
    echo [build-windows] 警告：未设置 MYAPPID，将由 ps1 报错退出。
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1" %*
set RC=%ERRORLEVEL%

if not "%RC%"=="0" (
    echo [build-windows] 失败，退出码 %RC%
)
exit /b %RC%
