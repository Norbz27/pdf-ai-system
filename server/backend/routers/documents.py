from fastapi import APIRouter, Depends, HTTPException, Request
from bson import ObjectId
from ..db.mongo import get_db
from ..services import audit as audit_service
from ..db.repositories import documents as docs_repo
from ..db.repositories import categories as cat_repo
from ..db.repositories import users as users_repo
from typing import Any, Dict
from datetime import datetime
import os
import math

router = APIRouter()

@router.post("/documents")
async def create_document(body: Dict[str, Any], request: Request):
	db = get_db()
	file_name = body.get("fileName")
	category_id = body.get("categoryId")
	description = body.get("description") or ""
	size = body.get("size")
	uploaded_by = body.get("uploadedBy")
	if not all([file_name, category_id, size, uploaded_by]):
		raise HTTPException(status_code=400, detail={"message": "Missing required fields"})
	# Verify category
	category = await cat_repo.find_by_id(db, category_id)
	if not category:
		raise HTTPException(status_code=404, detail={"message": "Category not found"})
	# Verify user
	user = await users_repo.find_by_id(db, uploaded_by)
	if not user:
		raise HTTPException(status_code=404, detail={"message": "User not found"})
	# Insert document
	now_iso = datetime.utcnow().isoformat()
	res = await docs_repo.insert_one(db, {
		"name": file_name,
		"categoryId": ObjectId(category_id),
		"description": description,
		"size": size,
		"uploadedBy": ObjectId(uploaded_by),
		"status": "uploaded",
		"createdAt": now_iso,
		"updatedAt": now_iso,
	})
	# Audit
	ip = request.headers.get('x-forwarded-for') or request.headers.get('x-real-ip') or 'unknown'
	await audit_service.document_upload(db, user.get("name", ""), user.get("email", ""), file_name, size, None, ip)
	return {"message": "Saved", "id": str(res.inserted_id)}

@router.get("/documents")
async def list_documents(request: Request):
	db = get_db()
	url = request.url
	qs = dict(request.query_params)
	user_id = qs.get("userId")
	user_role = qs.get("userRole")
	match_stage: Dict[str, Any] = {}
	if user_id and user_id not in ('null', 'undefined'):
		try:
			object_id = ObjectId(user_id)
			if user_role and user_role not in ('null', 'undefined'):
				match_stage = {"$or": [
					{"uploadedBy": object_id},
					{"sharedWith": {"$in": [object_id]}},
					{"accessGrants": {"$elemMatch": {"type": 'role', "value": user_role}}}
				]}
			else:
				match_stage = {"$or": [
					{"uploadedBy": object_id},
					{"sharedWith": {"$in": [object_id]}}
				]}
		except Exception:
			match_stage = {}
	elif user_role and user_role not in ('null', 'undefined'):
		match_stage = {"accessGrants": {"$elemMatch": {"type": 'role', "value": user_role}}}
	pipeline = [
		{"$match": match_stage},
		{"$lookup": {"from": "categories", "localField": "categoryId", "foreignField": "_id", "as": "category"}},
		{"$lookup": {"from": "users", "localField": "uploadedBy", "foreignField": "_id", "as": "uploader"}},
		{"$unwind": {"path": "$category", "preserveNullAndEmptyArrays": True}},
		{"$unwind": {"path": "$uploader", "preserveNullAndEmptyArrays": True}},
		{"$project": {
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
			"sharedWith": 1
		}},
		{"$sort": {"createdAt": -1}}
	]
	documents = await docs_repo.find_many_with_aggregation(db, pipeline)
	# Convert ObjectIds to strings for output consistency
	for d in documents:
		if isinstance(d.get("_id"), ObjectId):
			d["_id"] = str(d["_id"]) 
		if isinstance(d.get("uploadedBy"), ObjectId):
			d["uploadedBy"] = str(d["uploadedBy"]) 
	return {"documents": documents}

@router.delete("/documents")
async def delete_document(id: str, request: Request):
	db = get_db()
	if not id:
		raise HTTPException(status_code=400, detail={"message": "Missing id"})
	doc = await docs_repo.find_by_id(db, id)
	if not doc:
		raise HTTPException(status_code=404, detail={"message": "Document not found"})
	# Remove file if exists
	file_path = doc.get("filePath")
	if file_path:
		abs_path = file_path if os.path.isabs(file_path) else os.path.join(os.getcwd(), file_path)
		try:
			if os.path.exists(abs_path):
				os.remove(abs_path)
		except Exception:
			pass
	await docs_repo.delete_by_id(db, id)
	# Audit delete by uploader if available
	uploader = await users_repo.find_by_id(db, str(doc.get("uploadedBy"))) if doc.get("uploadedBy") else None
	ip = request.headers.get('x-forwarded-for') or request.headers.get('x-real-ip') or 'unknown'
	if uploader:
		await audit_service.document_delete(db, uploader.get("name", ""), uploader.get("email", ""), doc.get("name", ""), ip)
	return {"message": "Deleted"} 