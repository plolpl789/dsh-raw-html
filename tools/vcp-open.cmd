@echo off
rem ============================================================
rem vcp-open.cmd  --  render a VCP card file, then open it in the
rem default browser (channel B: "must actually look at it").
rem
rem Usage:
rem   vcp-open.cmd <card.html> [output.html]
rem Example:
rem   vcp-open.cmd examples\demo-card.html
rem
rem (ASCII only on purpose: cmd.exe parses this file with the OEM
rem  code page, so non-ASCII text here breaks command parsing.)
rem ============================================================
setlocal
set "DIR=%~dp0"
set "IN=%~1"
set "OUT=%~2"
if "%IN%"=="" (
  echo Usage: vcp-open.cmd ^<card.html^> [output.html]
  exit /b 1
)
if "%OUT%"=="" set "OUT=%~dpn1-rendered.html"
node "%DIR%vcp-card2html.cjs" "%IN%" "%OUT%"
if errorlevel 1 exit /b 1
echo.
echo Opening in default browser: %OUT%
start "" "%OUT%"
endlocal
