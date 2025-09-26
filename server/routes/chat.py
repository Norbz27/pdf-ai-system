from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Request, Body
from server.services.document_pipeline import load_faiss_index, get_qa_chain, filter_by_metadata
from langchain_ollama import OllamaLLM
from server.middleware.auth import JWTBearer, require_permission
import os
from server.routes.chat_request import ChatRequest
from langchain_community.vectorstores import FAISS
import httpx
from bson import ObjectId
from server.lib.mongodb import get_database
import asyncio
from typing import List, Dict, Any

router = APIRouter()

MAX_CONTEXT_LENGTH = 2000
CHUNKS_PER_DOC = 1
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://192.168.0.191:11434")
OLLAMA_MODEL = "llama3.2:1b"

async def get_embedding(text: str) -> List[float]:
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{OLLAMA_URL}/api/embeddings", json={"model": "nomic-embed-text", "prompt": text}, timeout=20.0)
        if res.status_code != 200:
            raise Exception(f"Embedding API error: {res.status_code}")
        data = res.json()
        return data.get("embedding", [])

def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0

def get_relevant_chunks_keyword(chunks: List[Dict], question: str) -> List[Dict]:
    keywords = question.lower().split()
    return sorted(chunks, key=lambda c: sum(1 for w in keywords if w in c["text"].lower()), reverse=True)

async def select_relevant_chunks(docs: List[Dict], question: str) -> List[Dict]:
    all_chunks = []
    for doc in docs:
        for chunk in doc.get("chunks", []):
            all_chunks.append({**chunk, "doc": doc})

    if not all_chunks:
        return []

    # Try semantic
    try:
        query_emb = await get_embedding(question)
        for chunk in all_chunks[:100]:  # limit
            if "embedding" not in chunk or not chunk["embedding"]:
                chunk["embedding"] = await get_embedding(chunk["text"])
            chunk["score"] = cosine_similarity(query_emb, chunk["embedding"])
        ranked = sorted(all_chunks, key=lambda c: c.get("score", 0), reverse=True)
    except Exception:
        ranked = get_relevant_chunks_keyword(all_chunks, question)

    # Select top
    selected = []
    doc_count = {}
    total_len = 0
    for chunk in ranked:
        doc_id = str(chunk["doc"]["_id"])
        if doc_count.get(doc_id, 0) < CHUNKS_PER_DOC:
            if total_len + len(chunk["text"]) > MAX_CONTEXT_LENGTH:
                break
            selected.append(chunk)
            doc_count[doc_id] = doc_count.get(doc_id, 0) + 1
            total_len += len(chunk["text"])
    return selected

@router.websocket("/ws")
async def chat_ws(websocket: WebSocket, user=Depends(JWTBearer())):
    await websocket.accept()
    vector_store = await load_faiss_index()
    llm = OllamaLLM(model="llama3.2:1b", base_url=os.getenv("OLLAMA_URL", "http://192.168.0.191:11434"))
    qa_chain = get_qa_chain(vector_store, llm)
    history = []
    try:
        while True:
            data = await websocket.receive_text()
            # Always use dict with 'query' key for RetrievalQA
            answer = qa_chain.run({"query": data})
            history.append({"user": data, "bot": answer})
            await websocket.send_text(answer)
    except WebSocketDisconnect:
        await websocket.close()

@router.post("")
async def chat_endpoint(body: ChatRequest, user=Depends(JWTBearer())):
    question = body.question
    docIds = body.docIds or []
    user_obj = body.user or {}

    if not question or not question.strip():
        return {"error": "Missing question"}

    user_id_str = user_obj.get("_id")
    user_id = ObjectId(user_id_str) if user_id_str and ObjectId.is_valid(user_id_str) else None
    user_role = user_obj.get("role")

    db = await get_database()

    # Fetch docs
    access_filter = {}
    if user_id:
        access_filter = {"$or": [{"uploadedBy": user_id}, {"sharedWith": {"$in": [user_id]}}]}
        if user_role:
            access_filter["$or"].append({"accessGrants": {"$elemMatch": {"type": "role", "value": user_role}}})

    if docIds:
        id_filter = {"_id": {"$in": [ObjectId(did) for did in docIds if ObjectId.is_valid(did)]}}
        docs = await db["documents"].find({**id_filter, **access_filter}).to_list(length=None)
    else:
        docs = await db["documents"].find(access_filter).to_list(length=None)

    # List intent
    normalized_question = question.strip().lower()
    list_intents = ["list documents", "list of documents", "show documents", "what documents do you have", "what files are uploaded", "show me the documents", "which documents are available", "which files do you know", "what files do you know", "what documents are there", "give me a list of documents", "give me a list of files", "show all documents", "show all files"]
    if any(intent in normalized_question for intent in list_intents):
        doc_list = [{"id": str(d["_id"]), "name": d.get("name", "Untitled")} for d in docs]
        if not doc_list:
            answer = "I currently don't have any documents uploaded."
        elif len(doc_list) == 1:
            answer = f"I have one document: {doc_list[0]['name']}"
        else:
            answer = "Here are the documents I know about:\n" + "\n".join(f"{i+1}. {d['name']}" for i, d in enumerate(doc_list))
        return {"answer": answer}

    # Greetings
    greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"]
    if normalized_question in greetings:
        prompt = f"You are Oxy, a friendly AI assistant. Greet the user and offer help. Be concise."
        if user_obj:
            prompt += f"\n\nUser Info:\nName: {user_obj.get('name', 'Unknown')}\nEmail: {user_obj.get('email', 'Unknown')}\nRole: {user_obj.get('role', 'Unknown')}"
        prompt += f"\n\nUser Question: {question}\n\nAnswer:"
    else:
        # Select chunks
        selected_chunks = await select_relevant_chunks(docs, question)
        context = "\n\n".join(c["text"] for c in selected_chunks)[:MAX_CONTEXT_LENGTH]
        user_details = ""
        if user_obj:
            user_details = f"\n\nUser Info:\nName: {user_obj.get('name', 'Unknown')}\nEmail: {user_obj.get('email', 'Unknown')}\nRole: {user_obj.get('role', 'Unknown')}"
        prompt = f"You are Oxy, an expert document assistant of a company Oxytec Solutions Inc. Use ONLY the following document content to answer the user's question. Do not use outside knowledge. Use the term company instead of from the document. Respond with proper formating like indention, header, listing, table, etc. Specify where you found the info like what page or section on the end of your respond.\n\nDocument Content:\n{context}{user_details}\n\nUser Question: {question}\n\nAnswer:"

    # Call Ollama
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{OLLAMA_URL}/api/generate", json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}, timeout=60.0)
        if res.status_code != 200:
            return {"answer": f"Hello {user_obj.get('name', 'User')}! I'm Oxy, your AI assistant. How can I help you today?"}
        data = res.json()
        answer = data.get("response", f"Hello {user_obj.get('name', 'User')}! I'm Oxy, your AI assistant. How can I help you today?")
        return {"answer": answer}
