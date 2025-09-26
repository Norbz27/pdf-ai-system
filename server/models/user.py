from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional

class User(BaseModel):
    id: Optional[str]
    email: EmailStr
    name: str
    permissions: List[str] = []

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str
