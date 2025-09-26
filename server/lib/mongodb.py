from motor.motor_asyncio import AsyncIOMotorClient
from server.config import settings

client = AsyncIOMotorClient(settings.MONGODB_URI)
db = client["DocuMind_AI"]  # Use the same database name as Next.js API

# Dependency for FastAPI
async def get_db():
    return db

async def get_database():
    return db
