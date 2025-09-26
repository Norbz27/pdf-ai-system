from fastapi import APIRouter, Query, Body, Depends, HTTPException
from server.lib.mongodb import db
from server.lib.audit_logger import document_upload
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.get("/")
async def get_documents(category: str = Query(None), status: str = Query(None), search: str = Query(None)):
    filter = {}
    if category and category != "all":
        filter["category"] = category
    if status and status != "all":
        filter["status"] = status
    if search:
        filter["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"uploadedBy": {"$regex": search, "$options": "i"}}
        ]
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
    return {"documents": documents}

@router.post("/")
async def create_document(body: dict = Body(...)):
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
