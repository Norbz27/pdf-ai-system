from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime

COLLECTION = "auditlogs"

async def log_event(db: AsyncIOMotorDatabase,
	user: str,
	user_email: str,
	action: str,
	resource: str,
	details: Optional[str] = None,
	ip_address: Optional[str] = None,
	user_agent: Optional[str] = None,
	severity: str = "info",
	category: str = "system",
):
	doc = {
		"user": user,
		"userEmail": user_email,
		"action": action,
		"resource": resource,
		"details": details,
		"ipAddress": ip_address,
		"userAgent": user_agent,
		"severity": severity,
		"category": category,
		"timestamp": datetime.utcnow(),
	}
	await db[COLLECTION].insert_one(doc)

async def document_upload(db: AsyncIOMotorDatabase, user: str, user_email: str, file_name: str, file_size: Optional[str], pages: Optional[int], ip: Optional[str]):
	details = f"Document uploaded successfully. File size: {file_size}, Pages: {pages}"
	await log_event(db, user, user_email, "DOCUMENT_UPLOAD", file_name, details, ip, None, "info", "document")

async def document_delete(db: AsyncIOMotorDatabase, user: str, user_email: str, file_name: str, ip: Optional[str]):
	await log_event(db, user, user_email, "DOCUMENT_DELETE", file_name, "Document deleted permanently", ip, None, "warning", "document")

async def system_error(db: AsyncIOMotorDatabase, user: str, user_email: str, error: str, ip: Optional[str]):
	await log_event(db, user, user_email, "SYSTEM_ERROR", "System Error", error, ip, None, "error", "system") 