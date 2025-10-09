from fastapi import FastAPI, Request, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging
from fastapi.staticfiles import StaticFiles
import os, anyio
from contextlib import asynccontextmanager
import asyncio
from server.config import settings
from server.middleware.logger import RequestLoggerMiddleware
from server.middleware.audit_logger import AuditLoggerMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi import APIRouter
from server.routes.documents import router as documents_router
from server.routes.query import router as query_router
from server.routes.chat import router as chat_router
from server.routes.admin import router as admin_router
from server.routes.admin_documents import router as admin_documents_router
from server.routes.categories import router as categories_router
from server.routes.roles import router as roles_router
from server.routes.users import router as users_router
from server.routes.auth import router as auth_router
from server.routes.audit_logs import router as audit_logs_router
from server.routes.download import router as download_router
from server.routes.ollama import router as ollama_router
from server.routes.test_db import router as test_db_router
from server.routes.test_env import router as test_env_router

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up the FastAPI Document AI Server...")
    try:
        yield
    except asyncio.CancelledError:
        logger.info("Server shutdown initiated...")
        # Suppress the CancelledError to prevent it from propagating
    finally:
        logger.info("Shutting down the FastAPI Document AI Server...")

app = FastAPI(lifespan=lifespan)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.168.0.150:3000", "http://localhost:3000"],  # Allow both LAN and localhost for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom route to serve static files from the 'uploads' directory with CORS headers
@app.get("/uploads/{file_path:path}")
async def serve_upload_file(file_path: str, request: Request):
    file_full_path = os.path.join(UPLOAD_DIR, file_path)
    
    # Security: Ensure the path is within the UPLOAD_DIR
    if not os.path.abspath(file_full_path).startswith(os.path.abspath(UPLOAD_DIR)):
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        # Check if file exists and is a file
        file_info = await anyio.to_thread.run_sync(os.stat, file_full_path)
        if not file_info or not os.path.isfile(file_full_path):
            raise FileNotFoundError
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

    # Manually set CORS headers to ensure pdf.js can access the file
    response = FileResponse(file_full_path)
    origin = request.headers.get('origin')
    if origin in ["http://192.168.0.150:3000", "http://localhost:3000"]:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        # pdf.js might need this for range requests (e.g., for large PDFs)
        response.headers["Access-Control-Expose-Headers"] = "Content-Length, Content-Range"

    return response

app.add_middleware(RequestLoggerMiddleware)
app.add_middleware(AuditLoggerMiddleware)

# Logging Configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as exc:
        # Log the error more safely to avoid serialization issues
        try:
            logger.error("Error occurred in request processing")
        except Exception:
            pass  # Don't log anything if even basic logging fails
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal server error"})

@app.get("/")
def read_root():
    logger.info("Root endpoint accessed.")
    return {"message": "FastAPI Document AI Server is running."}

@app.get("/api/admin/categories")
async def redirect_categories():
    return RedirectResponse(url="/api/categories", status_code=302)

@app.get("/api/admin/roles")
async def redirect_roles():
    return RedirectResponse(url="/api/roles", status_code=302)

# Mount PDF.js static files
app.mount("/pdfjs", StaticFiles(directory="public/pdfjs"), name="pdfjs")

app.include_router(documents_router, prefix="/api/documents")
app.include_router(query_router, prefix="/api/query")
app.include_router(chat_router, prefix="/api/chat")
app.include_router(admin_documents_router, prefix="/api/admin/documents")
app.include_router(categories_router, prefix="/api/admin/categories")
app.include_router(categories_router, prefix="/api/categories")
app.include_router(roles_router, prefix="/api/admin/roles")
app.include_router(roles_router, prefix="/api/roles")
app.include_router(users_router, prefix="/api/admin/users")
app.include_router(users_router, prefix="/api/users")
app.include_router(admin_router, prefix="/api/admin")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(audit_logs_router, prefix="/api/audit-logs")
app.include_router(download_router, prefix="/api/download")
app.include_router(ollama_router, prefix="/api/ollama")
app.include_router(test_db_router, prefix="/api/test-db")
app.include_router(test_env_router, prefix="/api/test-env")
from server.routes.seed import router as seed_router
app.include_router(seed_router, prefix="/api/seed")
