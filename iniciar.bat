@echo off
cd /d "%~dp0"

:: Mata qualquer processo node rodando na porta 3000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 "') do (
  taskkill /PID %%a /F >nul 2>&1
)

echo.
echo  ============================
echo   AvaliaBot iniciando...
echo  ============================
echo.
node server.js
pause
