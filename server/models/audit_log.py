from pydantic import BaseModel
from typing import Optional

class AuditLog(BaseModel):
    id: Optional[str]
    user_id: Optional[str]
    action: str
    timestamp: str
    details: Optional[str]
