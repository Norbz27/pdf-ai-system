from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .db.mongo import connect_to_mongo, close_mongo_connection
from .routers import health
from .routers import documents as documents_router
from .routers import document_item as document_item_router
from .routers import document_access as document_access_router
from .routers import uploads as uploads_router
from .routers import admin_documents as admin_documents_router
from .routers import chat as chat_router
from .routers import ws_chat as ws_chat_router
from .routers import simple_lists as simple_lists_router

app = FastAPI(title="DocuMind Backend", version="1.0.0")

app.add_middleware(
	CORSMiddleware,
	allow_origins=[settings.FRONTEND_ORIGIN],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"]
)

@app.on_event("startup")
async def on_startup():
	await connect_to_mongo()

@app.on_event("shutdown")
async def on_shutdown():
	await close_mongo_connection()

app.include_router(health.router, prefix="/health", tags=["health"]) 
app.include_router(documents_router.router, tags=["documents"]) 
app.include_router(document_item_router.router, tags=["documents"]) 
app.include_router(document_access_router.router, tags=["documents"]) 
app.include_router(uploads_router.router, tags=["uploads"]) 
app.include_router(admin_documents_router.router, tags=["admin"]) 
app.include_router(chat_router.router, tags=["chat"]) 
app.include_router(ws_chat_router.router, tags=["chat"]) 
app.include_router(simple_lists_router.router, tags=["lists"]) 