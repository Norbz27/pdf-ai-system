from fastapi import APIRouter, Query, Body, Depends, HTTPException
from server.middleware.auth import JWTBearer, require_permission
from server.lib.audit_logger import document_upload
from bson import ObjectId
from datetime import datetime
import logging
import os

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


@router.patch("/{document_id}")
async def patch_document(document_id: str, body: dict = Body(...)):
    """
    Update document status or trigger reprocessing.
    """
    try:
        from server.lib.mongodb import get_database
        db = await get_database()

        update_data = {"updatedAt": datetime.utcnow().isoformat()}

        if "status" in body:
            status = body["status"]
            if status not in ["processed", "processing", "error"]:
                raise HTTPException(status_code=400, detail="Invalid status. Must be 'processed', 'processing', or 'error'")
            update_data["status"] = status

        if "reprocess" in body and body["reprocess"]:
            # For reprocess, set status to processed
            update_data["status"] = "processed"

        result = await db["documents"].update_one({"_id": ObjectId(document_id)}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Document not found")

        return {"message": "Document updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """
    Delete a document by ID and remove its embeddings from the FAISS index.
    """
    try:
        from server.services.document_pipeline import index_documents, FAISS_INDEX_PATH
        import pathlib
        from server.lib.mongodb import get_database
        db = await get_database()

        # Find document to delete
        doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Delete file if exists
        file_path = doc.get("filePath")
        if file_path:
            abs_path = file_path if os.path.isabs(file_path) else os.path.join(os.getcwd(), file_path)
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                except Exception as e:
                    # Log but continue
                    import logging
                    logging.warning(f"Failed to delete file {abs_path}: {e}")

        # Delete document from DB
        result = await db["documents"].delete_one({"_id": ObjectId(document_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Document not found")

        # Rebuild FAISS index excluding deleted document
        remaining_docs_cursor = db["documents"].find({})
        remaining_docs = await remaining_docs_cursor.to_list(length=None)

        # Collect all chunks from remaining documents
        all_chunks = []
        for doc in remaining_docs:
            chunks = doc.get("chunks", [])
            for chunk in chunks:
                from langchain.schema import Document
                metadata = chunk.copy()
                metadata["doc_id"] = str(doc["_id"])
                chunk_doc = Document(page_content=chunk["text"], metadata=metadata)
                all_chunks.append(chunk_doc)

        embeddings = None
        # Load embeddings
        from langchain_ollama import OllamaEmbeddings
        embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=os.getenv("OLLAMA_URL"))

        index_path = pathlib.Path(FAISS_INDEX_PATH)
        index_file = index_path / "index.faiss"

        if all_chunks:
            from langchain_community.vectorstores import FAISS
            vector_store = FAISS.from_documents(all_chunks, embeddings)
            vector_store.save_local(FAISS_INDEX_PATH)
        else:
            # No documents left, remove index files if exist
            if index_file.exists():
                try:
                    index_file.unlink()
                except Exception as e:
                    import logging
                    logging.warning(f"Failed to delete FAISS index file {index_file}: {e}")
            # Also remove index metadata file if exists
            index_metadata = index_path / "index.pkl"
            if index_metadata.exists():
                try:
                    index_metadata.unlink()
                except Exception as e:
                    import logging
                    logging.warning(f"Failed to delete FAISS index metadata file {index_metadata}: {e}")

        return {"message": "Document and its embeddings deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
