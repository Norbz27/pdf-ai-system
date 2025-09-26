from typing import Any, Dict, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

COLLECTION_NAME = "users"

def oid(id_str: str) -> ObjectId:
	return ObjectId(id_str)

async def find_by_id(db: AsyncIOMotorDatabase, id_str: str) -> Optional[Dict[str, Any]]:
	return await db[COLLECTION_NAME].find_one({"_id": oid(id_str)})

async def find_one(db: AsyncIOMotorDatabase, query: Dict[str, Any]):
	return await db[COLLECTION_NAME].find_one(query) 