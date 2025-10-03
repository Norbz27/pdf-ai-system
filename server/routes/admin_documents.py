from fastapi import APIRouter, Query, Body, Depends, HTTPException
from server.middleware.auth import JWTBearer, require_permission
from server.lib.audit_logger import document_upload
from bson import ObjectId
from datetime import datetime
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("")
async def get_documents(category: str = Query(None), status: str = Query(None), search: str = Query(None)):
    try:
        from server.lib.mongodb import get_database
        db = await get_database()
        filter = {}
        if category and category != "all":
            try:
                filter["categoryId"] = ObjectId(category)
            except Exception as e:
                logger.warning(f"Invalid category ObjectId: {category}, ignoring filter")
        if status and status != "all":
            filter["status"] = status
        if search:
            filter["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"uploadedBy": {"$regex": search, "$options": "i"}}
            ]

        # Try aggregation first, fall back to simple query if it fails
        documents = []
        try:
            pipeline = [
                {"$match": filter},
                {"$lookup": {
                    "from": "categories",
                    "localField": "categoryId",
                    "foreignField": "_id",
                    "as": "categoryInfo"
                }},
                {"$lookup": {
                    "from": "users",
                    "localField": "uploadedBy",
                    "foreignField": "_id",
                    "as": "userInfo"
                }},
                {"$addFields": {
                    "category": {"$arrayElemAt": ["$categoryInfo.name", 0]},
                    "uploadedBy": {"$arrayElemAt": ["$userInfo.name", 0]}
                }},
                {"$project": {"categoryInfo": 0, "userInfo": 0}},
                {"$sort": {"createdAt": -1}}
            ]
            documents = await db["documents"].aggregate(pipeline).to_list(length=100)
            logger.info(f"Aggregation successful, returned {len(documents)} documents")
        except Exception as agg_e:
            logger.error(f"Aggregation pipeline failed: {str(agg_e)}, falling back to simple query")
            # Fall back to simple query
            documents = await db["documents"].find(filter).sort("createdAt", -1).to_list(length=100)
            logger.info(f"Simple query fallback returned {len(documents)} documents")

        # Convert ObjectId fields to strings for JSON serialization
        for doc in documents:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            if "categoryId" in doc and isinstance(doc["categoryId"], ObjectId):
                doc["categoryId"] = str(doc["categoryId"])
            if "uploadedBy" in doc and isinstance(doc["uploadedBy"], ObjectId):
                doc["uploadedBy"] = str(doc["uploadedBy"])

        logger.info(f"Returning {len(documents)} documents after ObjectId conversion")
        return {"documents": documents}
    except Exception as e:
        logger.error(f"Error fetching documents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")


@router.post("/")
async def create_document(user=Depends(require_permission("admin_access")), body: dict = Body(...)):
    from server.lib.mongodb import get_database
    db = await get_database()
    name = body.get("name")
    categoryId = body.get("categoryId")
    uploadedBy = body.get("uploadedBy")
    size = body.get("size", "0 MB")
    pages = body.get("pages", 0)
    status = body.get("status", "processing")
    if not name or not categoryId or not uploadedBy:
        raise HTTPException(status_code=400, detail="Missing required fields: name, categoryId, uploadedBy")
    # Check for duplicate
    existing = await db["documents"].find_one({"name": name})
    if existing:
        raise HTTPException(status_code=409, detail="Document with this name already exists")
    new_doc = {
        "name": name,
        "categoryId": ObjectId(categoryId),
        "uploadedBy": ObjectId(uploadedBy),
        "size": size,
        "pages": pages,
        "status": status,
        "filePath": "",
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat()
    }
    result = await db["documents"].insert_one(new_doc)
    ip_address = "unknown"  # Should be extracted from request headers if available
    document_upload("Admin", "admin@example.com", name, size, pages, ip_address)
    return {"success": True, "documentId": str(result.inserted_id), "document": {**new_doc, "_id": str(result.inserted_id)}}
