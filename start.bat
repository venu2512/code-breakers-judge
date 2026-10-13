@echo off
REM ============================================================
REM  Code Breakers Judge - start the server with one double-click
REM  Run this on the SERVER PC only.
REM ============================================================
setlocal
cd /d "%~dp0"

echo [1/3] Checking dependencies...
if not exist node_modules (
  echo      Installing npm packages ^(first run only^)...
  call npm install || goto :error
)

echo [2/3] Building the app...
REM Always rebuild so a stale .next can never run old code at the event.
REM This takes about a minute; the build is skipped only on fresh installs
REM already handled below.
call npm run build || goto :error

REM Detect Server IP address automatically
set SERVER_IP=
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1 | Get-NetIPAddress | Where-Object AddressFamily -eq 'IPv4').IPAddress"`) do set "SERVER_IP=%%i"

if "%SERVER_IP%"=="" (
  for /f "usebackq delims=" %%i in (`node -e "const os=require('os'),nets=os.networkInterfaces();for(const n of Object.keys(nets)){for(const net of nets[n]){if(net.family==='IPv4'&&!net.internal&&!net.address.startsWith('169.254')){console.log(net.address);process.exit(0)}}}"`) do set "SERVER_IP=%%i"
)

if "%SERVER_IP%"=="" set "SERVER_IP=localhost"

echo [3/3] Starting server on 0.0.0.0:3000
echo ============================================================
echo   SERVER IS READY!
echo.
echo   On this PC:
echo     http://localhost:3000
echo.
echo   On other devices (Phones / Laptops / Lab PCs):
echo     http://%SERVER_IP%:3000
echo.
echo   Admin login:
echo     http://%SERVER_IP%:3000/admin/login
echo ============================================================
echo   Press Ctrl+C to stop.
echo.
call npx next start -H 0.0.0.0 -p 3000
goto :eof

:error
echo.
echo STARTUP FAILED. Read the messages above.
pause
exit /b 1
