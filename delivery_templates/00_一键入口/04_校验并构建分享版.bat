@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
set "PY=D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
cd /d "%ROOT%\02_供应链可视化平台"
"%PY%" scripts\validate_dashboard_data.py --mode competition
if errorlevel 1 goto :fail
"%PY%" scripts\build_share_html.py
if errorlevel 1 goto :fail
echo 校验和分享版构建完成。
pause
exit /b 0
:fail
echo 操作失败，请检查错误信息。
pause
exit /b 1