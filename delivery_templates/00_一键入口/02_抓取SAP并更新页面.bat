@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
set "PY=D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\02_供应链可视化平台\scripts\run_sap_pipeline.ps1" -SapRoot "%ROOT%\01_SAP自动抓取与数据生成" -SapPython "%PY%" -ProjectRoot "%ROOT%\02_供应链可视化平台" -Python "%PY%" -MaskMode 部分 -BuildShare
pause