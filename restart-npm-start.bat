@echo off
setlocal

:restart
echo [%date% %time%] Building...
call npm run build
if errorlevel 1 (
    echo [%date% %time%] Build failed. Waiting 15 seconds before retry...
    timeout /t 15 /nobreak >nul
    goto restart
)
echo [%date% %time%] Starting: npm start
call npm start

echo [%date% %time%] npm start exited with code %errorlevel%.
echo Waiting 15 seconds before restart...
timeout /t 15 /nobreak >nul
goto restart
