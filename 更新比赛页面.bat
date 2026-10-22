@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set "PY=D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
echo [1/3] 生成比赛版数据...
"%PY%" scripts\generate_data.py --mode competition
if errorlevel 1 goto :fail
echo [2/3] 校验比赛版数据...
"%PY%" scripts\validate_dashboard_data.py --mode competition
if errorlevel 1 goto :fail
echo [3/3] 打包单文件分享版...
"%PY%" scripts\build_share_html.py
if errorlevel 1 goto :fail
echo.
echo 更新完成：
echo 在线版：http://127.0.0.1:8765/
echo 分享版：%~dp0dist\供应雷达-分享讨论版.html
pause
exit /b 0
:fail
echo.
echo 更新失败，请查看上面的错误信息。本次数据不应发布。
pause
exit /b 1