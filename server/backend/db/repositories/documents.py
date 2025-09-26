from typing import Any, Dict, List, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

COLLECTION_NAME = "documents"

def oid(id_str: str) -> ObjectId:
	return ObjectId(id_str)

async def insert_one(db: AsyncIOMotorDatabase, doc: Dict[str, Any]):
	return await db[COLLECTION_NAME].insert_one(doc)

async def find_by_id(db: AsyncIOMotorDatabase, id_str: str) -> Optional[Dict[str, Any]]:
	return await db[COLLECTION_NAME].find_one({"_id": oid(id_str)})

async def delete_by_id(db: AsyncIOMotorDatabase, id_str: str) -> int:
	res = await db[COLLECTION_NAME].delete_one({"_id": oid(id_str)})
	return res.deleted_count or 0

async def find_many_with_aggregation(db: AsyncIOMotorDatabase, pipeline: List[Dict[str, Any]]):
	cursor = db[COLLECTION_NAME].aggregate(pipeline)
	return [doc async for doc in cursor]

async def find_one(db: AsyncIOMotorDatabase, query: Dict[str, Any]):
	return await db[COLLECTION_NAME].find_one(query)

async def update_one(db: AsyncIOMotorDatabase, id_str: str, update: Dict[str, Any]):
	return await db[COLLECTION_NAME].update_one({"_id": oid(id_str)}, update) 