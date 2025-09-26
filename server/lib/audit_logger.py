from server.config import settings
from datetime import datetime
from pymongo import MongoClient
import logging

logger = logging.getLogger(__name__)

_client = None
_db = None

def _get_db():
    global _client, _db
    if _client is None:
        try:
            _client = MongoClient(settings.MONGODB_URI)
            _db = _client["DocuMind_AI"]
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
    return _db

def document_upload(user_name, user_email, file_name, file_size, pages, ip_address):
    try:
        db = _get_db()
        db.audit_logs.insert_one({
            "event": "document_upload",
            "user_name": user_name,
            "user_email": user_email,
            "file_name": file_name,
            "file_size": file_size,
            "pages": pages,
            "ip_address": ip_address,
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"Failed to log document upload: {e}")

def system_error(user_name, user_email, message, ip_address):
    try:
        db = _get_db()
        db.audit_logs.insert_one({
            "event": "system_error",
            "user_name": user_name,
            "user_email": user_email,
            "message": message,
            "ip_address": ip_address,
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"Failed to log system error: {e}")
