from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
import logging
from server.config import settings
from server.middleware.logger import RequestLoggerMiddleware
from server.middleware.audit_logger import AuditLoggerMiddleware
from fastapi.responses import JSONResponse
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

app = FastAPI()

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.168.0.150:3000", "http://localhost:3000"],  # Allow both LAN and localhost for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

app.include_router(documents_router, prefix="/api/documents")
app.include_router(query_router, prefix="/api/query")
app.include_router(chat_router, prefix="/api/chat")
app.include_router(admin_router, prefix="/api/admin")
app.include_router(admin_documents_router, prefix="/api/admin/documents")
app.include_router(categories_router, prefix="/api/categories")
app.include_router(roles_router, prefix="/api/roles")
app.include_router(users_router, prefix="/api/users")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(audit_logs_router, prefix="/api/audit-logs")
app.include_router(download_router, prefix="/api/download")
app.include_router(ollama_router, prefix="/api/ollama")
app.include_router(test_db_router, prefix="/api/test-db")
app.include_router(test_env_router, prefix="/api/test-env")
from server.routes.seed import router as seed_router
app.include_router(seed_router, prefix="/api/seed")
