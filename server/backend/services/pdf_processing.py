from typing import List, Tuple
from langchain_community.document_loaders import PyPDFLoader
from pathlib import Path

async def extract_pages(file_path: str) -> List[Tuple[int, str]]:
	# PyPDFLoader is synchronous; run directly here (FastAPI background ok)
	loader = PyPDFLoader(file_path)
	docs = loader.load()
	pages: List[Tuple[int, str]] = []
	for d in docs:
		page_num = int((d.metadata or {}).get('page', 0)) + 1
		pages.append((page_num, d.page_content or ""))
	return pages 