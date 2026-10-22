@echo off
cd /d "%~dp0"
set "PY=D:\Users\22614\Documents\供应雷达\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
start "" /min "%PY%" -m http.server 8765 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/"
exit /b