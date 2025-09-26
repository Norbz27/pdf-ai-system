from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from server.config import settings

class JWTBearer(HTTPBearer):
    async def __call__(self, request: Request):
        credentials: HTTPAuthorizationCredentials = await super().__call__(request)
        if credentials:
            try:
                payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=["HS256"])
                request.state.user = payload
                return payload
            except jwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="Token expired.")
            except jwt.InvalidTokenError:
                raise HTTPException(status_code=401, detail="Invalid token.")
        else:
            raise HTTPException(status_code=403, detail="Authorization token missing.")

# Permission decorator

def require_permission(permission: str):
    def decorator(user=Depends(JWTBearer())):
        if permission not in user.get("permissions", []):
            raise HTTPException(status_code=403, detail="Insufficient permissions.")
        return user
    return decorator
