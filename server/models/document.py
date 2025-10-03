from pydantic import BaseModel, Field
from typing import Optional, List
from bson import ObjectId

class DocumentChunk(BaseModel):
    text: str
    chunkIndex: int
    page: int
    section: str
    embedding: Optional[list]

class AccessGrant(BaseModel):
    type: str  # "role" or "name"
    value: str  # role name or user name

class DocumentModel(BaseModel):
    name: str
    categoryId: ObjectId
    description: Optional[str]
    size: str
    filePath: str
    pages: int
    chunks: List[DocumentChunk]
    uploadedBy: ObjectId
    sharedWith: List[ObjectId] = []
    accessGrants: List[AccessGrant] = []
    publicAccess: bool = False
    status: str
    createdAt: str
    updatedAt: str

    class Config:
        arbitrary_types_allowed = True
