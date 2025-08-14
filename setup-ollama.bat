@echo off
echo 🚀 Setting up Ollama with Docker...

REM Start Ollama container
echo 📦 Starting Ollama container...
docker-compose up -d

REM Wait for Ollama to be ready
echo ⏳ Waiting for Ollama to be ready...
timeout /t 10 /nobreak >nul

REM Pull the llama3 model
echo 📥 Pulling llama3 model...
curl -X POST http://localhost:11434/api/pull -d "{\"name\": \"llama3\"}"

echo ✅ Setup complete! Ollama is running on http://localhost:11434
echo 📋 Available models:
curl -s http://localhost:11434/api/tags

echo.
echo 🎯 Next steps:
echo 1. Start your Next.js app: npm run dev
echo 2. Open http://localhost:3000/chat
echo 3. Start chatting with your documents!

pause 