from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from ..core.config import settings

_mongo_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None

async def connect_to_mongo() -> None:
	global _mongo_client, _db
	if _mongo_client is None:
		_mongo_client = AsyncIOMotorClient(settings.MONGODB_URI)
		_db = _mongo_client[settings.DB_NAME]

async def close_mongo_connection() -> None:
	global _mongo_client
	if _mongo_client is not None:
		_mongo_client.close()
		_mongo_client = None

def get_db() -> AsyncIOMotorDatabase:
	if _db is None:
		raise RuntimeError("MongoDB not initialized")
	return _db 