# DocuMind FastAPI Backend

## Requirements
- Python 3.11+
- MongoDB (or use docker-compose)
- Redis (optional, used for caching)
- Ollama running on host (default http://localhost:11434)

## Environment
Create `server/.env` with:

MONGODB_URI=mongodb://localhost:27017
DB_NAME=DocuMind_AI
JWT_SECRET=change_me
JWT_ALG=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
EMBED_MODEL=nomic-embed-text

FAISS_DATA_DIR=./faiss
REDIS_URL=redis://localhost:6379/0
FRONTEND_ORIGIN=http://localhost:3000

## Install & Run (dev)

pip install -r server/requirements.txt
uvicorn backend.main:app --reload --app-dir server

Health endpoints:
- GET http://localhost:8000/health/live
- GET http://localhost:8000/health/ready

## Docker Compose

1) Make sure Ollama is running on your host at http://localhost:11434
2) Start services:

docker compose up --build

Backend available at http://localhost:8000

## Frontend configuration
Set in `.env.local` for Next.js:

NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

Then update components already wired to `lib/api-client.js`.

## Notes
- File uploads are stored under `public/uploads/` (project root) and referenced by `filePath`.
- Document processing: PyPDFLoader -> chunking -> FAISS per document.
- Chat: retrieval from FAISS + Ollama. WebSocket streaming at `/ws/chat`.
- Caching: Redis optional; if `REDIS_URL` unset, caching is skipped. 


# Start Server
uvicorn server.main:app --reload --host 0.0.0.0 --port 8000   