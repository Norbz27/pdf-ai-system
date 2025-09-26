from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId
from ..db.mongo import get_db
from ..db.repositories import documents as docs_repo
from pypdf import PdfReader
from pathlib import Path
from datetime import datetime

router = APIRouter()

def chunk_text(text: str, chunk_size: int = 1000):
	chunks = []
	for i in range(0, len(text), chunk_size):
		chunks.append({"text": text[i:i+chunk_size], "chunkIndex": i // chunk_size})
	return chunks

@router.patch("/documents/{id}")
async def update_document(id: str, body: dict, request: Request):
	db = get_db()
	status = body.get("status")
	reprocess = body.get("reprocess")
	if not status or status not in ['processed', 'processing', 'error']:
		raise HTTPException(status_code=400, detail={"error": "Invalid status. Must be 'processed', 'processing', or 'error'"})
	if reprocess:
		doc = await docs_repo.find_by_id(db, id)
		if not doc:
			raise HTTPException(status_code=404, detail={"error": "Document not found"})
		file_path = doc.get("filePath")
		if not file_path:
			raise HTTPException(status_code=400, detail={"error": "Document file path not found"})
		abs_path = Path(file_path) if Path(file_path).is_absolute() else Path.cwd() / file_path
		try:
			from ..services.pdf_processing import extract_pages
			from ..services.chunking import Chunker
			from ..services.vector_store import VectorStoreService
			pages_list = await extract_pages(str(abs_path))
			page_dicts = [{ 'page': p, 'text': t } for p, t in pages_list]
			chunks = Chunker().chunk_pages(page_dicts)
			VectorStoreService().build_for_document(id, chunks)
			pages = len(pages_list)
		except Exception as e:
			await docs_repo.update_one(db, id, {"$set": {"status": 'error', "updatedAt": datetime.utcnow().isoformat()}})
			raise HTTPException(status_code=500, detail={"error": "Failed to extract PDF content"})
		await docs_repo.update_one(db, id, {"$set": {"status": 'processed', "pages": pages, "chunks": chunks, "updatedAt": datetime.utcnow().isoformat()}})
		return {"success": True, "message": "Document reprocessed successfully"}
	else:
		res = await docs_repo.update_one(db, id, {"$set": {"status": status, "updatedAt": datetime.utcnow().isoformat()}})
		return {"success": True, "message": f"Document status updated to {status}"} 