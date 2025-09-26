@echo off
echo Starting PDF AI System...
echo.
echo Starting Frontend (Next.js)...
start "Frontend Dev Server" cmd /k "pnpm run dev"
echo.
echo Starting Backend (FastAPI)...
start "Backend API Server" cmd /k "fastapi_env\Scripts\activate && python -m server"
echo.
echo Both servers are starting in separate windows.
echo Frontend: http://localhost:3000
echo Backend: http://localhost:8000
pause