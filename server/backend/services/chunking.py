from typing import List, Dict, Any
from langchain.text_splitter import RecursiveCharacterTextSplitter

DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 200

class Chunker:
	def __init__(self, chunk_size: int = DEFAULT_CHUNK_SIZE, chunk_overlap: int = DEFAULT_CHUNK_OVERLAP):
		self.splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

	def chunk_pages(self, pages: List[dict]) -> List[Dict[str, Any]]:
		# pages: [{ 'page': int, 'text': str }]
		chunks: List[Dict[str, Any]] = []
		section = 1
		for p in pages:
			texts = self.splitter.split_text(p['text'])
			for idx, t in enumerate(texts):
				chunks.append({
					'text': t,
					'chunkIndex': len(chunks),
					'page': p['page'],
					'section': section,
					'embedding': None,
				})
				section += 1
		return chunks 