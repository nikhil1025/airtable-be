@echo off
REM Quick start script for Windows

echo Starting Airtable Application...
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo Error: Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

echo Building and starting backend container...
cd airtable-be
docker compose -f docker-compose.yml up -d --build

echo.
echo Building and starting frontend container...
cd ..\airtable-fe
docker compose -f docker-compose.yml up -d --build

echo.
echo Waiting for services to start...
timeout /t 10 /nobreak >nul

echo.
echo Application started successfully!
echo.
echo Access the application at:
echo    Frontend: http://localhost:4200
echo    Backend:  http://localhost:3000
echo.
echo Useful commands:
echo    View backend logs:   docker logs -f airtable-backend
echo    View frontend logs:  docker logs -f airtable-frontend
echo    Stop application:    stop.bat
echo.
pause
