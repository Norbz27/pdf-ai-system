import logging
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from server.config import settings

class JWTBearer(HTTPBearer):
    async def __call__(self, request: Request):
        logging.info(f"JWTBearer: Request method: {request.method}, URL: {request.url}")
        logging.info(f"JWTBearer: Request headers: {dict(request.headers)}")
        credentials: HTTPAuthorizationCredentials = await super().__call__(request)
        logging.info(f"JWTBearer: credentials obtained: {credentials is not None}")
        if credentials:
            logging.info(f"JWTBearer: credentials scheme: {credentials.scheme}, credentials length: {len(credentials.credentials) if credentials.credentials else 0}")
            try:
                payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=["HS256"])
                request.state.user = payload
                logging.info(f"JWTBearer: Successfully decoded payload: {payload}")
                logging.info(f"JWTBearer: Payload permissions: {payload.get('permissions', 'No permissions key')}")
                return payload
            except jwt.ExpiredSignatureError:
                logging.warning("JWTBearer: ExpiredSignatureError")
                raise HTTPException(status_code=401, detail="Token expired.")
            except jwt.InvalidTokenError:
                logging.warning("JWTBearer: InvalidTokenError")
                raise HTTPException(status_code=401, detail="Invalid token.")
            except Exception as e:
                logging.error(f"JWTBearer: Exception during decode: {e}")
                raise HTTPException(status_code=401, detail="Token validation failed.")
        else:
            logging.warning("JWTBearer: No credentials provided")
            raise HTTPException(status_code=403, detail="Authorization token missing.")

# Permission decorator

def require_permission(permission: str):
    def decorator(user=Depends(JWTBearer())):
        if permission not in user.get("permissions", []):
            raise HTTPException(status_code=403, detail="Insufficient permissions.")
        return user
    return decorator
