@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BACKEND_DIR=%ROOT%\backend"
set "ENV_FILE=%BACKEND_DIR%\.env"
set "PORT=8095"
set "URL=http://127.0.0.1:%PORT%/"
set "HEALTH_URL=http://127.0.0.1:%PORT%/health"

rem One URL for both the public profile and the admin panel. Click
rem "Developer Login" in the top right to sign in (demo: admin / admin123,
rem see backend\.env) and reveal the editing controls; everyone else just
rem sees the plain public profile.

if not exist "%BACKEND_DIR%\node_modules" (
  echo Backend dependencies are not installed yet.
  echo Run this first:  cd backend ^&^& npm install
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo backend\.env was not found.
  echo Copy backend\.env.example to backend\.env to get started with demo admin/admin123 login,
  echo then change ADMIN_PASSWORD_HASH before any real deployment.
  exit /b 1
)

rem Kill by whatever is actually bound to our port, not by matching the process
rem command line: Windows does not report the working directory in CommandLine,
rem so a "*backend*server.js*" filter never matches "node server.js" and silently
rem leaves old instances running on the port, serving stale content.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -WorkingDirectory '%BACKEND_DIR%' -FilePath 'node' -ArgumentList @('server.js')"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 40;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%'; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Milliseconds 250 }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo Server did not start correctly. Check backend\.env and try running "node server.js" manually from backend\ to see the error.
  exit /b 1
)

start "" "%URL%"
exit /b 0
