from typing import List, Dict, Any, Optional
from langchain_community.vectorstores import FAISS
from langchain.docstore.document import Document
from .embeddings import EmbeddingService
from ..core.config import settings
from pathlib import Path
import pickle

INDEX_DIR = Path(settings.FAISS_DATA_DIR)
INDEX_DIR.mkdir(parents=True, exist_ok=True)

class VectorStoreService:
	def __init__(self):
		self.emb = EmbeddingService()

	def _paths(self, doc_id: str):
		idx_path = INDEX_DIR / f"{doc_id}.faiss"
		meta_path = INDEX_DIR / f"{doc_id}.pkl"
		return idx_path, meta_path

	def build_for_document(self, doc_id: str, chunks: List[Dict[str, Any]]):
		docs = [Document(page_content=c['text'], metadata={ 'docId': doc_id, 'page': c.get('page'), 'chunkIndex': c.get('chunkIndex'), 'section': c.get('section') }) for c in chunks]
		store = FAISS.from_documents(docs, self.emb.emb)
		idx_path, meta_path = self._paths(doc_id)
		store.save_local(str(INDEX_DIR / doc_id))
		# FAISS local save creates folder; we keep folder per doc id

	def load_for_document(self, doc_id: str) -> Optional[FAISS]:
		folder = INDEX_DIR / doc_id
		if not folder.exists():
			return None
		return FAISS.load_local(str(folder), self.emb.emb, allow_dangerous_deserialization=True)

	def merge_stores(self, stores: List[FAISS]) -> Optional[FAISS]:
		if not stores:
			return None
		base = stores[0]
		for s in stores[1:]:
			base.merge_from(s)
		return base

	def similarity_search(self, store: FAISS, query: str, k: int = 5):
		return store.similarity_search(query, k=k) 