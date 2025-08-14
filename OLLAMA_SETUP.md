# Ollama Setup for DocuMind AI

This guide will help you set up Ollama with Docker to power your document chat system.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm/pnpm installed
- Your Next.js app ready to run

## Quick Setup

### Option 1: Using the setup script (Linux/Mac)
```bash
chmod +x setup-ollama.sh
./setup-ollama.sh
```

### Option 2: Using the setup script (Windows)
```cmd
setup-ollama.bat
```

### Option 3: Manual setup
```bash
# Start Ollama container
docker-compose up -d

# Wait for Ollama to be ready (about 10 seconds)
sleep 10

# Pull the llama3 model
curl -X POST http://localhost:11434/api/pull -d '{"name": "llama3"}'
```

## What Changed

### Backend Changes (`app/api/chat/route.ts`)
- Updated to use Ollama API directly at `http://localhost:11434/api/generate`
- Changed from OpenRouter to local Ollama instance
- Updated response parsing to match Ollama's format: `{ "response": "..." }`
- **NEW**: Added support for `OLLAMA_URL` environment variable for flexible server configuration

### Frontend Changes (`app/chat/page.tsx`)
- Removed OpenRouter API calls
- Updated to use local `/api/chat` endpoint
- Changed AI status check to use Ollama's `/api/tags` endpoint
- Updated error messages to be more helpful

### Configuration
The application now supports environment variables for Ollama configuration:
- `OLLAMA_URL`: Set to your Ollama server URL (default: `http://localhost:11434`)
- `OLLAMA_MODEL`: Set to your preferred model name (default: `llama3.1`)
- Example: `OLLAMA_URL=http://192.168.1.100:11434` for remote servers
- Example: `OLLAMA_MODEL=mistral` for different models

## API Endpoints

### Ollama API
- **Generate**: `POST http://localhost:11434/api/generate`
- **List Models**: `GET http://localhost:11434/api/tags`

### Your App API
- **Chat**: `POST /api/chat`
  - Body: `{ "question": "your question", "docIds": ["doc1", "doc2"] }`
  - Response: `{ "answer": "AI response" }`

## Usage

1. **Start Ollama**: Run the setup script or manual commands above
2. **Start your app**: `npm run dev` or `pnpm dev`
3. **Open chat**: Navigate to `http://localhost:3000/chat`
4. **Upload documents**: Go to the upload page and add PDFs
5. **Start chatting**: Ask questions about your documents!

## Troubleshooting

### Ollama not responding
```bash
# Check if container is running
docker ps

# Check logs
docker logs ollama

# Restart container
docker-compose restart
```

### Model not found
```bash
# List available models
curl http://localhost:11434/api/tags

# Pull a different model if needed
curl -X POST http://localhost:11434/api/pull -d '{"name": "llama2"}'
```

### Port conflicts
If port 11434 is already in use, update the `docker-compose.yml`:
```yaml
ports:
  - "11435:11434"  # Change to different port
```
Then update the API calls in your code to use the new port.

## Available Models

You can use any model available in Ollama. Some popular options:
- `llama3.1` (default)
- `llama3`
- `llama2`
- `mistral`
- `codellama`

To use a different model, set the `OLLAMA_MODEL` environment variable:
```bash
OLLAMA_MODEL=mistral
```

Or update the default in `app/api/chat/route.ts`:
```typescript
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.1";
```

## Performance Tips

- **GPU Support**: For better performance, ensure Docker has GPU access
- **Model Size**: Smaller models are faster but less capable
- **Memory**: Ensure your system has enough RAM for the model you choose

## Security Notes

- Ollama runs locally, so your data stays on your machine
- No API keys required
- No external API calls for AI responses
- Document processing still uses your existing MongoDB setup 