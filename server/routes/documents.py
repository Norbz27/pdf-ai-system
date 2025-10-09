from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Query
from server.services.document_pipeline import load_pdf, index_documents
from server.lib.mongodb import get_database
from server.lib.audit_logger import document_upload, system_error
from server.models.document import DocumentModel, DocumentChunk, AccessGrant
from langchain.schema import Document
from bson import ObjectId
import os
from datetime import datetime
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

FAISS_INDEX_PATH = "server/lib/faiss_index"

async def process_pdf(file_path, file_name, category_id, description, uploaded_by, ip_address, user_agent, document_id):
    logger.info(f"Starting processing for document {document_id}")
    try:
        docs, metadata = load_pdf(file_path)
        logger.info(f"Loaded PDF: {len(docs)} pages")
        # Add document_id to metadata for FAISS indexing
        for doc in docs:
            doc.metadata['doc_id'] = document_id
        vector_store = await index_documents(docs)
        logger.info("Indexed documents in FAISS")
        chunks = [DocumentChunk(
            text=doc.page_content,
            chunkIndex=i,
            page=doc.metadata.get('page', 1),
            section=doc.metadata.get('section', ''),
            embedding=None
        ).dict() for i, doc in enumerate(docs)]
        logger.info(f"Created {len(chunks)} chunks")
        size = f"{os.path.getsize(file_path) / 1024:.1f} KB"
        db = await get_database()
        # Erase current chunks and update with new data
        await db["documents"].update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {"chunks": [], "status": "processing"}}
        )

        # Rebuild FAISS index excluding old chunks for this document
        from langchain_community.vectorstores import FAISS
        from langchain_ollama import OllamaEmbeddings
        all_other_chunks = []
        cursor = db["documents"].find({})
        async for other_doc in cursor:
            if str(other_doc["_id"]) != document_id:
                for chunk in other_doc.get("chunks", []):
                    metadata = chunk.copy()
                    metadata["doc_id"] = str(other_doc["_id"])
                    chunk_doc = Document(page_content=chunk["text"], metadata=metadata)
                    all_other_chunks.append(chunk_doc)
        embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=os.getenv("OLLAMA_URL"))
        # Rebuild FAISS index
        if all_other_chunks:
            vector_store = FAISS.from_documents(all_other_chunks, embeddings)
        else:
            vector_store = None
        # Add new chunks
        from server.services.document_pipeline import chunk_documents
        new_chunks = chunk_documents(docs)
        if vector_store is None:
            vector_store = FAISS.from_documents(new_chunks, embeddings)
        else:
            vector_store.add_documents(new_chunks)
        vector_store.save_local(FAISS_INDEX_PATH)

        result = await db["documents"].update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {
                "size": size,
                "pages": metadata.get("num_pages", 1),
                "chunks": chunks,
                "status": "processed",
                "updatedAt": datetime.utcnow().isoformat()
            }}
        )
        logger.info(f"Update result for document {document_id}: matched {result.matched_count}, modified {result.modified_count}")
        if result.modified_count == 0:
            logger.error(f"Failed to update document {document_id}, no document matched")
        else:
            logger.info(f"Updated document {document_id} to processed")
        document_upload(uploaded_by, "", file_name, size, metadata.get("num_pages", 1), ip_address)
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {str(e)}")
        db = await get_database()
        await db["documents"].update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {"status": "error", "updatedAt": datetime.utcnow().isoformat()}}
        )
        system_error(uploaded_by, "", f"Document upload failed: {file_name} - {str(e)}", ip_address)
        raise

@router.get("/check-name")
async def check_document_name(name: str, userId: str):
    """
    Check if a document name exists for the user and suggest a new name if it does.
    """
    logger.info(f"Checking document name: name={name}, userId={userId}")
    try:
        db = await get_database()

        # Check if document with exact name exists for the user
        existing = await db["documents"].find_one({"name": name, "uploadedBy": ObjectId(userId)})
        if not existing:
            return {"exists": False}

        # Find all documents with similar names (base name + optional (number))
        import re
        base_match = re.match(r"^(.*?)(\s*\(\d+\))?\.pdf$", name, re.IGNORECASE)
        if not base_match:
            base_name = name.rsplit('.', 1)[0] if '.' in name else name
            ext = name.rsplit('.', 1)[1] if '.' in name else ''
        else:
            base_name = base_match.group(1)
            ext = "pdf"

        # Find max version
        pattern = f"^{re.escape(base_name)}\\s*\\(\\d+\\)\\.{re.escape(ext)}$"
        similar_docs = await db["documents"].find({"name": {"$regex": pattern, "$options": "i"}, "uploadedBy": ObjectId(userId)}).to_list(length=None)
        versions = [0]
        for doc in similar_docs:
            match = re.search(r"\((\d+)\)", doc["name"])
            if match:
                versions.append(int(match.group(1)))

        max_version = max(versions)
        suggested_name = f"{base_name} ({max_version + 1}).{ext}"

        return {"exists": True, "suggestedName": suggested_name}

    except Exception as e:
        logger.error(f"Error checking document name: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check document name: {str(e)}")


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    request: Request,
    userId: str = Query(None, description="User ID for filtering access"),
    userRole: str = Query(None, description="User role for filtering access")
):
    """
    Get a single document by ID, with access filtering by userId and userRole.
    """
    try:
        logger.info(f"Fetching document {document_id}")

        db = await get_database()

        # Validate document_id
        try:
            ObjectId(document_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid document ID")

        matchStage = {"_id": ObjectId(document_id)}
        if userRole == 'Admin':
            # Admin can access all documents
            pass
        elif userId and userId != 'null' and userId != 'undefined':
            try:
                objectId = ObjectId(userId)
                if userRole and userRole != 'null' and userRole != 'undefined':
                    matchStage.update({
                        "$or": [
                            {"uploadedBy": objectId},
                            {"sharedWith": {"$in": [objectId]}},
                            {"accessGrants": {"$elemMatch": {"type": "role", "value": userRole}}},
                            {"publicAccess": True}
                        ]
                    })
                else:
                    matchStage.update({
                        "$or": [
                            {"uploadedBy": objectId},
                            {"sharedWith": {"$in": [objectId]}},
                            {"publicAccess": True}
                        ]
                    })
            except:
                # Invalid ObjectId, check only document exists
                pass
        elif userRole and userRole != 'null' and userRole != 'undefined':
            matchStage.update({
                "$or": [
                    {"accessGrants": {"$elemMatch": {"type": "role", "value": userRole}}},
                    {"publicAccess": True}
                ]
            })
        else:
            # If no userId or userRole, only allow public documents
            matchStage.update({"publicAccess": True})

        # Aggregate document with category and user information
        pipeline = [
            {"$match": matchStage},
            {
                "$lookup": {
                    "from": "categories",
                    "localField": "categoryId",
                    "foreignField": "_id",
                    "as": "category"
                }
            },
            {
                "$lookup": {
                    "from": "users",
                    "localField": "uploadedBy",
                    "foreignField": "_id",
                    "as": "uploader"
                }
            },
            {
                "$unwind": {
                    "path": "$category",
                    "preserveNullAndEmptyArrays": True
                }
            },
            {
                "$unwind": {
                    "path": "$uploader",
                    "preserveNullAndEmptyArrays": True
                }
            },

            {
                "$project": {
                    "_id": 1,
                    "name": 1,
                    "description": 1,
                    "size": 1,
                    "status": 1,
                    "createdAt": 1,
                    "updatedAt": 1,
                    "categoryName": "$category.name",
                    "uploaderName": "$uploader.name",
                    "uploadedBy": 1,
                    "pages": 1,
                    "filePath": 1,
                    "sharedWith": 1,
                    "sharedUserNames": "$sharedUsers.name",
                    "accessGrants": 1,
                    "publicAccess": 1,
                    "chunks": 1
                }
            }
        ]

        documents = await db["documents"].aggregate(pipeline).to_list(length=1)

        if not documents:
            raise HTTPException(status_code=404, detail="Document not found or access denied")

        doc = documents[0]

        # Construct absolute URL for filePath
        if doc.get("filePath"):
            doc["filePath"] = str(request.base_url).rstrip('/') + doc["filePath"]

        # Convert ObjectId to string for JSON serialization
        try:
            # Safely convert _id to string
            if "_id" in doc and doc["_id"] is not None:
                doc["_id"] = str(doc["_id"])

            # Convert uploadedBy to string if it's an ObjectId
            if "uploadedBy" in doc and doc["uploadedBy"] is not None:
                if isinstance(doc["uploadedBy"], ObjectId):
                    doc["uploadedBy"] = str(doc["uploadedBy"])

            # Convert sharedWith array of ObjectId to strings
            if "sharedWith" in doc and doc["sharedWith"] is not None:
                if isinstance(doc["sharedWith"], list):
                    doc["sharedWith"] = [str(oid) if isinstance(oid, ObjectId) else oid for oid in doc["sharedWith"]]

        except Exception as e:
            logger.error(f"Error serializing document {document_id}: {str(e)}")

        logger.info(f"Returning document {document_id}")
        return {"document": doc}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch document: {str(e)}")


@router.get("/")
async def get_documents(
    request: Request,
    userId: str = Query(None, description="User ID for filtering documents"),
    userRole: str = Query(None, description="User role for filtering documents")
):
    """
    Get all documents, optionally filtered by userId and userRole.
    """
    try:
        logger.info("Documents endpoint accessed")

        db = await get_database()

        matchStage = {}
        if userRole == 'Admin':
            # Admin can see all documents
            matchStage = {}
        elif userId and userId != 'null' and userId != 'undefined':
            try:
                objectId = ObjectId(userId)
                if userRole and userRole != 'null' and userRole != 'undefined':
                    matchStage = {
                        "$or": [
                            {"uploadedBy": objectId},
                            {"sharedWith": {"$in": [objectId]}},
                            {"accessGrants": {"$elemMatch": {"type": "role", "value": userRole}}},
                            {"publicAccess": True}
                        ]
                    }
                else:
                    matchStage = {
                        "$or": [
                            {"uploadedBy": objectId},
                            {"sharedWith": {"$in": [objectId]}},
                            {"publicAccess": True}
                        ]
                    }
            except:
                # Invalid ObjectId, no filter
                matchStage = {}
        elif userRole and userRole != 'null' and userRole != 'undefined':
            matchStage = {
                "$or": [
                    {"accessGrants": {"$elemMatch": {"type": "role", "value": userRole}}},
                    {"publicAccess": True}
                ]
            }
        else:
            # If no userId or userRole, include public documents
            matchStage = {"publicAccess": True}

        # Aggregate documents with category and user information
        pipeline = [
            {"$match": matchStage},
            {
                "$lookup": {
                    "from": "categories",
                    "localField": "categoryId",
                    "foreignField": "_id",
                    "as": "category"
                }
            },
            {
                "$lookup": {
                    "from": "users",
                    "localField": "uploadedBy",
                    "foreignField": "_id",
                    "as": "uploader"
                }
            },
            {
                "$unwind": {
                    "path": "$category",
                    "preserveNullAndEmptyArrays": True
                }
            },
            {
                "$unwind": {
                    "path": "$uploader",
                    "preserveNullAndEmptyArrays": True
                }
            },
            {
                "$lookup": {
                    "from": "users",
                    "localField": "sharedWith",
                    "foreignField": "_id",
                    "as": "sharedUsers"
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "name": 1,
                    "description": 1,
                    "size": 1,
                    "status": 1,
                    "createdAt": 1,
                    "updatedAt": 1,
                    "categoryName": "$category.name",
                    "uploaderName": "$uploader.name",
                    "uploadedBy": 1,
                    "pages": 1,
                    "filePath": 1,
                    "sharedWith": 1,
                    "sharedUserNames": "$sharedUsers.name",
                    "accessGrants": 1,
                    "publicAccess": 1
                }
            },
            {
                "$sort": {"createdAt": -1}
            }
        ]

        documents = await db["documents"].aggregate(pipeline).to_list(length=None)

        # Convert ObjectId to string for JSON serialization
        serialized_documents = []
        for doc in documents:
            # Construct absolute URL for filePath
            if doc.get("filePath"):
                doc["filePath"] = str(request.base_url).rstrip('/') + doc["filePath"]

            try:
                # Safely convert _id to string
                if "_id" in doc and doc["_id"] is not None:
                    doc["_id"] = str(doc["_id"])

                # Convert uploadedBy to string if it's an ObjectId
                if "uploadedBy" in doc and doc["uploadedBy"] is not None:
                    if isinstance(doc["uploadedBy"], ObjectId):
                        doc["uploadedBy"] = str(doc["uploadedBy"])

                # Convert sharedWith array of ObjectId to strings
                if "sharedWith" in doc and doc["sharedWith"] is not None:
                    if isinstance(doc["sharedWith"], list):
                        doc["sharedWith"] = [str(oid) if isinstance(oid, ObjectId) else oid for oid in doc["sharedWith"]]

                # Convert accessGrants if present
                if "accessGrants" in doc and doc["accessGrants"] is not None:
                    doc["accessGrants"] = doc["accessGrants"]  # Already dicts, no change needed

                serialized_documents.append(doc)
            except Exception as e:
                # Log the error but continue processing other documents
                logger.error(f"Error serializing document: {str(e)}")
                continue

        logger.info(f"Returning {len(serialized_documents)} documents")
        return {"documents": serialized_documents}

    except Exception as e:
        logger.error(f"Error fetching documents: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")


@router.post("/{document_id}/access")
async def grant_access(document_id: str, payload: dict, request: Request):
    """
    Grant access to a document by user name or role.
    Payload: {"type": "name" or "role", "values": ["user1", "user2"] or ["role1", "role2"]}
    """
    try:
        logger.info(f"Granting access to document {document_id}")

        if not payload or "type" not in payload or "values" not in payload:
            raise HTTPException(status_code=400, detail="Payload must include 'type' and 'values'")

        doc_type = payload["type"]
        values = payload["values"]
        if not isinstance(values, list) or len(values) == 0:
            raise HTTPException(status_code=400, detail="'values' must be a non-empty array")

        if doc_type not in ["name", "role"]:
            raise HTTPException(status_code=400, detail="Type must be 'name' or 'role'")

        db = await get_database()

        # Validate document exists and user is owner
        doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # For simplicity, assume the caller is the owner (uploadedBy). In production, verify with auth token.
        # Here, we'll skip auth check as the frontend sends token, but middleware should handle.

        updates = {"$set": {"updatedAt": datetime.utcnow().isoformat()}}
        if doc_type == "name":
            # Find users by name and add their _id to sharedWith
            user_ids = []
            for name in values:
                user = await db["users"].find_one({"name": name})
                if not user:
                    logger.warning(f"User '{name}' not found")
                    continue
                user_ids.append(user["_id"])
            if user_ids:
                updates["$addToSet"] = {"sharedWith": {"$each": user_ids}}
        elif doc_type == "role":
            # Add access grants for roles
            grants = [{"type": "role", "value": role} for role in values]
            updates["$push"] = {"accessGrants": {"$each": grants}}

        # Apply update
        result = await db["documents"].update_one({"_id": ObjectId(document_id)}, updates)
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="No changes applied or document not found")

        logger.info(f"Access granted successfully for document {document_id}")
        return {"message": "Access granted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error granting access to document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to grant access: {str(e)}")


@router.delete("/{document_id}/access")
async def revoke_access(document_id: str, payload: dict, request: Request):
    """
    Revoke access from a document for specific users or roles.
    Payload: {"type": "name" or "role", "values": ["user1", "user2"] or ["role1", "role2"]}
    """
    try:
        logger.info(f"Revoking access from document {document_id}")

        if not payload or "type" not in payload or "values" not in payload:
            raise HTTPException(status_code=400, detail="Payload must include 'type' and 'values'")

        doc_type = payload["type"]
        values = payload["values"]
        if not isinstance(values, list) or len(values) == 0:
            raise HTTPException(status_code=400, detail="'values' must be a non-empty array")

        if doc_type not in ["name", "role"]:
            raise HTTPException(status_code=400, detail="Type must be 'name' or 'role'")

        db = await get_database()

        # Validate document exists
        doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        updates = {"$set": {"updatedAt": datetime.utcnow().isoformat()}}
        if doc_type == "name":
            # Find users by name and remove their _id from sharedWith
            user_ids = []
            for name in values:
                user = await db["users"].find_one({"name": name})
                if not user:
                    logger.warning(f"User '{name}' not found")
                    continue
                user_ids.append(user["_id"])
            if user_ids:
                updates["$pullAll"] = {"sharedWith": user_ids}
        elif doc_type == "role":
            # Remove specific role grants from accessGrants
            role_filters = [{"type": "role", "value": role} for role in values]
            updates["$pull"] = {"accessGrants": {"$in": role_filters}}

        # Apply update
        result = await db["documents"].update_one({"_id": ObjectId(document_id)}, updates)
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="No changes applied or document not found")

        logger.info(f"Access revoked successfully for document {document_id}")
        return {"message": "Access revoked successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking access from document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to revoke access: {str(e)}")


@router.post("/{document_id}/access/public")
async def toggle_public_access(document_id: str, payload: dict, request: Request):
    """
    Toggle public access for the document.
    Payload: {"publicAccess": true or false}
    """
    try:
        logger.info(f"Toggling public access for document {document_id}")

        if not payload or "publicAccess" not in payload:
            raise HTTPException(status_code=400, detail="Payload must include 'publicAccess'")

        public_access = payload["publicAccess"]
        if not isinstance(public_access, bool):
            raise HTTPException(status_code=400, detail="'publicAccess' must be a boolean")

        db = await get_database()

        # Validate document exists
        doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Apply update
        result = await db["documents"].update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {"publicAccess": public_access, "updatedAt": datetime.utcnow().isoformat()}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="No changes applied or document not found")

        access_status = "enabled" if public_access else "disabled"
        logger.info(f"Public access {access_status} for document {document_id}")
        return {"message": f"Public access {access_status} successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling public access for document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to toggle public access: {str(e)}")


@router.post("/{document_id}/reprocess")
async def reprocess_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    request: Request
):
    """
    Reprocess a document by re-running the PDF processing pipeline.
    """
    try:
        logger.info(f"Reprocessing document {document_id}")

        db = await get_database()

        # Validate document exists
        doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Check if file exists
        if not os.path.exists(doc["filePath"]):
            raise HTTPException(status_code=400, detail="Document file not found")

        # Set status to processing
        await db["documents"].update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {"status": "processing", "updatedAt": datetime.utcnow().isoformat()}}
        )

        # Extract metadata for process_pdf
        file_path = doc["filePath"]
        file_name = doc["name"]
        category_id = str(doc["categoryId"])
        description = doc.get("description", "")
        uploaded_by = str(doc["uploadedBy"])
        ip_address = "reprocess"  # Placeholder
        user_agent = "reprocess"  # Placeholder

        background_tasks.add_task(
            process_pdf, file_path, file_name, category_id, description, uploaded_by, ip_address, user_agent, document_id
        )

        logger.info(f"Reprocessing started for document {document_id}")
        return {"message": "Document reprocessing started"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reprocessing document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to reprocess document: {str(e)}")


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """
    Delete a document by ID and remove its embeddings from the FAISS index.
    """
    try:
        from server.services.document_pipeline import index_documents, FAISS_INDEX_PATH
        import pathlib
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


@router.post("/upload")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks
):
    form = await request.form()
    file = form.get("file")
    categoryId = form.get("categoryId")
    description = form.get("description", "")
    uploadedBy = form.get("uploadedBy")
    user_agent = form.get("user_agent", "unknown")
    ip_address = form.get("ip_address", "unknown")

    logger.info(f"Upload request received. Form keys: {list(form.keys())}")
    logger.info(f"File: {file}, categoryId: {categoryId}, uploadedBy: {uploadedBy}")

    if categoryId:
        categoryId = str(categoryId).strip()
    if uploadedBy:
        uploadedBy = str(uploadedBy).strip()

    logger.info(f"After strip: categoryId: '{categoryId}', uploadedBy: '{uploadedBy}'")

    missing = []
    if not file:
        missing.append("file")
    if not categoryId:
        missing.append("categoryId")
    if not uploadedBy:
        missing.append("uploadedBy")
    if missing:
        logger.error(f"Missing required fields: {missing}")
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")

    if categoryId == "" or uploadedBy == "":
        logger.error(f"Empty categoryId or uploadedBy: categoryId='{categoryId}', uploadedBy='{uploadedBy}'")
        raise HTTPException(status_code=400, detail="Invalid categoryId or uploadedBy")

    try:
        ObjectId(categoryId)
        ObjectId(uploadedBy)
        logger.info("ObjectIds are valid")
    except Exception as e:
        logger.error(f"Invalid ObjectId: categoryId='{categoryId}', uploadedBy='{uploadedBy}', error: {e}")
        raise HTTPException(status_code=400, detail="Invalid ObjectId for categoryId or uploadedBy")

    db = await get_database()
    category = await db["categories"].find_one({"_id": ObjectId(categoryId)})
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category")

    user = await db["users"].find_one({"_id": ObjectId(uploadedBy)})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid user")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    file_path = file_path.replace("\\", "/")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Insert document with initial status "processing"
    initial_document = DocumentModel(
        name=file.filename,
        categoryId=ObjectId(categoryId),
        description=description,
        size="",  # Will be updated by process_pdf
        filePath=f"/uploads/{file.filename}",  # Store URL path
        pages=0,  # Will be updated
        chunks=[],  # Will be updated
        uploadedBy=ObjectId(uploadedBy),
        status="processing",
        createdAt=datetime.utcnow().isoformat(),
        updatedAt=datetime.utcnow().isoformat()
    ).dict()
    result = await db["documents"].insert_one(initial_document)
    document_id = str(result.inserted_id)

    background_tasks.add_task(
        process_pdf, file_path, file.filename, categoryId, description, uploadedBy, ip_address, user_agent, document_id
    )
    return {"filename": file.filename, "status": "processing", "id": document_id}
