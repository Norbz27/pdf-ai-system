from typing import Any, Dict
from jose import jwt, JWTError
from ..core.config import settings

class AuthError(Exception):
	pass

def decode_token(token: str) -> Dict[str, Any]:
	try:
		payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
		return payload
	except JWTError as e:
		raise AuthError("Invalid or expired token") from e 