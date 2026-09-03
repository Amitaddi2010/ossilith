@echo off
title Ossilith Live Cloudflare Tunnel
echo ========================================================
echo         OSSILITH 3D SURGICAL PLANNING PLATFORM
echo              Cloudflare Free Public Tunnel
echo ========================================================
echo.
echo Launching Cloudflare Tunnel for http://localhost:3000...
echo (Your public https://...trycloudflare.com link will appear below)
echo.
if exist "%~dp0bin\cloudflared.exe" (
    "%~dp0bin\cloudflared.exe" tunnel --url http://localhost:3000 --http-host-header localhost:3000
) else (
    cloudflared tunnel --url http://localhost:3000 --http-host-header localhost:3000
)
pause
