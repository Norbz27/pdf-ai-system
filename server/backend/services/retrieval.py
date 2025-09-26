from typing import List, Dict, Any, Tuple
from bson import ObjectId
from ..db.mongo import get_db
from ..services.vector_store import VectorStoreService

MAX_CONTEXT_LENGTH = 2000
CHUNKS_PER_DOC = 1
MAX_SEMANTIC_CHUNKS = 100

def _keyword_score(text: str, question: str) -> int:
	keywords = [w for w in question.lower().split() if w]
	lct = text.lower()
	return sum(1 for w in keywords if w in lct)

class RetrievalService:
	def __init__(self):
		self.vs = VectorStoreService()

	async def load_docs_for_user(self, doc_ids: List[str] | None, user_id: str | None, user_role: str | None) -> List[Dict[str, Any]]:
		db = get_db()
		access_filter: Dict[str, Any] = {}
		if user_id:
			uid = ObjectId(user_id) if ObjectId.is_valid(user_id) else None
			if uid and user_role:
				access_filter = { '$or': [ { 'uploadedBy': uid }, { 'sharedWith': { '$in': [uid] } }, { 'accessGrants': { '$elemMatch': { 'type': 'role', 'value': user_role } } } ] }
			elif uid:
				access_filter = { '$or': [ { 'uploadedBy': uid }, { 'sharedWith': { '$in': [uid] } } ] }
		elif user_role:
			access_filter = { 'accessGrants': { '$elemMatch': { 'type': 'role', 'value': user_role } } }
		query: Dict[str, Any] = access_filter
		if doc_ids:
			valid_ids = [ObjectId(d) for d in doc_ids if isinstance(d, str) and ObjectId.is_valid(d)]
			if valid_ids:
				query = { **access_filter, '_id': { '$in': valid_ids } }
		cursor = db['documents'].find(query)
		return [doc async for doc in cursor]

	def select_chunks(self, docs: List[Dict[str, Any]], question: str) -> List[Dict[str, Any]]:
		# Try FAISS first across specified docs
		stores = []
		for d in docs:
			store = self.vs.load_for_document(str(d['_id']))
			if store:
				stores.append(store)
		if stores:
			merged = self.vs.merge_stores(stores)
			if merged:
				hits = merged.similarity_search(question, k=min(10, MAX_SEMANTIC_CHUNKS))
				ranked = []
				for h in hits:
					meta = h.metadata or {}
					ranked.append({
						'text': h.page_content,
						'chunkIndex': meta.get('chunkIndex', 0),
						'page': meta.get('page'),
						'section': meta.get('section'),
						'docId': meta.get('docId')
					})
				return self._limit_per_doc(ranked)
		# Fallback: keyword over stored chunks
		all_chunks: List[Dict[str, Any]] = []
		for d in docs:
			for c in d.get('chunks', [])[:MAX_SEMANTIC_CHUNKS]:
				all_chunks.append({ **c, 'docId': str(d['_id']) })
		if not all_chunks:
			return []
		ranked = sorted(all_chunks, key=lambda c: _keyword_score(c.get('text', ''), question), reverse=True)
		return self._limit_per_doc(ranked)

	def _limit_per_doc(self, ranked: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
		doc_counts: Dict[str, int] = {}
		selected: List[Dict[str, Any]] = []
		total_len = 0
		for c in ranked:
			did = c.get('docId') or 'unknown'
			doc_counts[did] = doc_counts.get(did, 0)
			if doc_counts[did] < CHUNKS_PER_DOC:
				if total_len + len(c.get('text', '')) > MAX_CONTEXT_LENGTH:
					break
				selected.append(c)
				doc_counts[did] += 1
				total_len += len(c.get('text', ''))
		return selected

	def build_prompt(self, context: str, question: str, user: Dict[str, Any] | None, is_first: bool) -> str:
		if context:
			base = "You are Oxy, an expert document assistant of a company Oxytec Solutions Inc. Use ONLY the following document content to answer the user's question. Do not use outside knowledge. Use the term company instead of from the document. Respond with proper formating like indention, header, listing, table, etc. Specify where you found the info like what page or section on the end of your respond.\n\nDocument Content:\n"
			prompt = f"{base}{context}"
			if user:
				prompt += f"\n\nUser Info:\nName: {user.get('name','Unknown')}\nEmail: {user.get('email','Unknown')}\nRole: {user.get('role','Unknown')}"
			prompt += f"\n\nUser Question: {question}\n\nAnswer:"
			return prompt
		if is_first:
			prompt = "You are Oxy, a helpful AI assistant. Answer the user's question. If the user asks about documents, let them know you can analyze them if requested."
			if user:
				prompt += f"\n\nUser Info:\nName: {user.get('name','Unknown')}\nEmail: {user.get('email','Unknown')}\nRole: {user.get('role','Unknown')}"
			prompt += f"\n\nUser Question: {question}\n\nAnswer:"
			return prompt
		return question 