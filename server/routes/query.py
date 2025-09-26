from fastapi import APIRouter, Query, Depends, HTTPException
from server.services.document_pipeline import load_faiss_index, hybrid_search, get_qa_chain, filter_by_metadata
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.llms import Ollama
from server.middleware.auth import JWTBearer
import os

router = APIRouter()

@router.get("/search")
async def search_documents(q: str = Query(...), user=Depends(JWTBearer())):
    vector_store = await load_faiss_index()
    results = hybrid_search(vector_store, q, metadata_filter={"permissions": user.get("permissions", [])})
    return [{"content": doc.page_content, "metadata": doc.metadata} for doc in results]

@router.get("/qa")
async def qa_query(q: str = Query(...), user=Depends(JWTBearer())):
    vector_store = await load_faiss_index()
    llm = Ollama(model="llama3.2:3b", base_url=os.getenv("OLLAMA_URL"))
    qa_chain = get_qa_chain(vector_store, llm)
    answer = qa_chain.run(q)
    return {"answer": answer}
