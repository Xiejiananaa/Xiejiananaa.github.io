@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run_sap_pipeline.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo SAP -^> JSON 流水线失败，退出码：%EXIT_CODE%
) else (
  echo SAP -^> JSON 流水线执行完成。
)
exit /b %EXIT_CODE%
