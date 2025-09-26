from typing import List
from langchain_community.embeddings import OllamaEmbeddings
from ..core.config import settings

class EmbeddingService:
	def __init__(self):
		self.emb = OllamaEmbeddings(base_url=settings.OLLAMA_URL, model=settings.EMBED_MODEL)

	def embed_texts(self, texts: List[str]) -> List[List[float]]:
		# LangChain handles batching internally for many providers, but we call once for list
		return self.emb.embed_documents(texts)

	def embed_query(self, text: str) -> List[float]:
		return self.emb.embed_query(text) 