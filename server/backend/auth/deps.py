from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any, Dict
from bson import ObjectId
from ..db.mongo import get_db
from ..db.repositories import users as users_repo
from ..db.repositories import roles as roles_repo
from ..core.security import decode_token, AuthError

http_bearer = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(http_bearer)) -> Dict[str, Any]:
	if credentials is None or not credentials.credentials:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
	token = credentials.credentials
	try:
		payload = decode_token(token)
	except AuthError:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
	db = get_db()
	user_id = payload.get("userId") or payload.get("sub")
	if not user_id:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
	user = await users_repo.find_by_id(db, user_id)
	if not user or user.get("status") != "active":
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
	# attach role
	role = None
	if user.get("roleId"):
		role = await roles_repo.find_by_id(db, str(user["roleId"]))
	user["role"] = role
	return user

async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
	permissions = (user.get("role") or {}).get("permissions") or []
	if "admin_access" not in permissions:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
	return user 