from fastapi import APIRouter, Depends
from server.middleware.auth import JWTBearer, require_permission

router = APIRouter()

@router.get("/health")
async def health_check():
    return {"status": "ok"}

@router.get("/audit-logs")
async def get_audit_logs(user=Depends(require_permission("admin"))):
    # TODO: Query audit logs from DB
    return {"logs": []}
