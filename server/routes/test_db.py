from fastapi import APIRouter, Depends, HTTPException
from server.lib.mongodb import get_database
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/test-db")
async def test_database_connection():
    """
    Test database connection and return basic information
    """
    try:
        db = await get_database()

        # Test connection by getting database stats
        db_stats = await db.command("dbStats")

        # Get collection counts
        collections = await db.list_collection_names()
        collection_counts = {}
        for collection_name in collections:
            count = await db[collection_name].count_documents({})
            collection_counts[collection_name] = count

        logger.info("Database connection test successful")
        return {
            "status": "success",
            "message": "Database connection successful",
            "database": {
                "name": db.name,
                "collections": len(collections),
                "collection_counts": collection_counts,
                "stats": {
                    "dataSize": db_stats.get("dataSize", 0),
                    "storageSize": db_stats.get("storageSize", 0),
                    "objects": db_stats.get("objects", 0)
                }
            }
        }

    except Exception as e:
        logger.error(f"Database connection test failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")
