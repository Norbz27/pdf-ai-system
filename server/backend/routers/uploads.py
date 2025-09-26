from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from bson import ObjectId
from pathlib import Path
from datetime import datetime
from ..db.mongo import get_db
from ..db.repositories import categories as cat_repo
from ..db.repositories import users as users_repo
from ..db.repositories import documents as docs_repo
from ..services import audit as audit_service

router = APIRouter()

@router.post("/documents/upload")
async def upload_document(
	request: Request,
	file: UploadFile = File(...),
	categoryId: str = Form(...),
	description: str = Form("") ,
	uploadedBy: str = Form(...),
):
	db = get_db()
	# Validate category and user
	category = await cat_repo.find_by_id(db, categoryId)
	if not category:
		raise HTTPException(status_code=404, detail={"message": "Category not found"})
	user = await users_repo.find_by_id(db, uploadedBy)
	if not user:
		raise HTTPException(status_code=404, detail={"message": "User not found"})
	# Save file to public/uploads
	uploads_dir = Path.cwd() / "public" / "uploads"
	uploads_dir.mkdir(parents=True, exist_ok=True)
	file_path = uploads_dir / file.filename
	content = await file.read()
	file_path.write_bytes(content)
	# Extract basic metadata; chunking/embeddings/FAISS will be processed later
	def format_size(n: int) -> str:
		if n == 0:
			return '0 Bytes'
		k = 1024
		sizes = ['Bytes', 'KB', 'MB', 'GB']
		i = int((n and (math.log(n) / math.log(k))) or 0)
		return f"{(n / (k ** i)):.1f} {sizes[i]}"
	import math
	size_str = format_size(len(content))
	now_iso = datetime.utcnow().isoformat()
	res = await docs_repo.insert_one(db, {
		"name": file.filename,
		"categoryId": ObjectId(categoryId),
		"description": description,
		"size": size_str,
		"filePath": str(file_path.relative_to(Path.cwd())),
		"status": "processing",
		"uploadedBy": ObjectId(uploadedBy),
		"createdAt": now_iso,
		"updatedAt": now_iso,
	})
	# Kick off background processing (extract -> chunk -> FAISS)
	from fastapi import BackgroundTasks
	background = request.state.background if hasattr(request.state, 'background') else None
	from ..background.tasks import process_document
	try:
		await process_document(str(res.inserted_id), str(file_path))
	except Exception:
		pass
	ip = request.headers.get('x-forwarded-for') or request.headers.get('x-real-ip') or 'unknown'
	await audit_service.document_upload(db, user.get("name", ""), user.get("email", ""), file.filename, size_str, None, ip)
	return {"message": "Saved", "id": str(res.inserted_id)} 