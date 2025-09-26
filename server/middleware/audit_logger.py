import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class AuditLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        user = getattr(request.state, 'user', None)
        # Log user more safely to avoid serialization issues
        try:
            user_str = str(user) if user else None
            logging.info(f"Audit: {request.method} {request.url} User: {user_str}")
        except Exception:
            logging.info(f"Audit: {request.method} {request.url} User: [could not serialize]")
        response = await call_next(request)
        return response
