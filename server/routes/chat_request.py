from pydantic import BaseModel
from typing import Optional, List

class ChatRequest(BaseModel):
    question: str
    docIds: Optional[List[str]] = []
    user: Optional[dict] = {}
