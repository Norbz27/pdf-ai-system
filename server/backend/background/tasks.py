from ..db.mongo import get_db
from ..services.pdf_processing import extract_pages
from ..services.chunking import Chunker
from ..services.vector_store import VectorStoreService
from bson import ObjectId
from datetime import datetime

chunker = Chunker()
vector_service = VectorStoreService()

async def process_document(doc_id: str, file_path: str):
	db = get_db()
	# Extract
	pages = await extract_pages(file_path)
	page_dicts = [{ 'page': p, 'text': t } for p, t in pages]
	chunks = chunker.chunk_pages(page_dicts)
	# Persist chunks (without embeddings)
	await db['documents'].update_one({ '_id': ObjectId(doc_id) }, { '$set': {
		'chunks': chunks,
		'pages': len(pages),
		'status': 'processed',
		'updatedAt': datetime.utcnow().isoformat(),
	}})
	# Build FAISS index
	vector_service.build_for_document(doc_id, chunks) 