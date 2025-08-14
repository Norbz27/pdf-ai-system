#!/bin/bash

echo "🚀 Setting up Ollama with Docker..."

# Start Ollama container
echo "📦 Starting Ollama container..."
docker-compose up -d

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to be ready..."
sleep 10

# Pull the llama3 model
echo "📥 Pulling llama3 model..."
curl -X POST http://localhost:11434/api/pull -d '{"name": "llama3"}'

echo "✅ Setup complete! Ollama is running on http://localhost:11434"
echo "📋 Available models:"
curl -s http://localhost:11434/api/tags | jq '.models[].name' 2>/dev/null || echo "No models found yet. The llama3 model is still downloading..."

echo ""
echo "🎯 Next steps:"
echo "1. Start your Next.js app: npm run dev"
echo "2. Open http://localhost:3000/chat"
echo "3. Start chatting with your documents!" 