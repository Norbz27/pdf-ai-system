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

async def select_relevant_chunks(question: str, docs: List[Dict]) -> List[Dict]:
    if not docs:
        print("No docs provided")
        return []

    allowed_ids = {str(doc["_id"]) for doc in docs}
    doc_map = {str(doc["_id"]): doc for doc in docs}
    print(f"Allowed doc IDs: {allowed_ids}")
    print(f"Number of docs: {len(docs)}")
    for doc in docs:
        chunks = doc.get("chunks", [])
        print(f"Doc {doc['_id']}: {len(chunks)} chunks")
        if chunks:
            print(f"Sample chunk text: {chunks[0].get('text', '')[:100]}...")

    vector_store = await load_faiss_index()
    if not vector_store:
        # Fallback to keyword search on chunks
        all_chunks = []
        for doc in docs:
            for chunk in doc.get("chunks", []):
                all_chunks.append({**chunk, "doc": doc})
        ranked = get_relevant_chunks_keyword(all_chunks, question)
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

    # FAISS similarity search
    try:
        results = vector_store.similarity_search_with_score(question, k=500)
        print(f"FAISS search returned {len(results)} results")
        filtered_results = [(doc, score) for doc, score in results if doc.metadata.get('doc_id') in allowed_ids]
        print(f"Filtered to {len(filtered_results)} results for allowed docs {allowed_ids}")
        if results:
            print(f"Sample metadata: {results[0][0].metadata}")
        ranked = sorted(filtered_results, key=lambda x: x[1])  # lower score is better
    except Exception as e:
        print(f"FAISS search failed: {e}")
        # Fallback
        all_chunks = []
        for doc in docs:
            for chunk in doc.get("chunks", []):
                all_chunks.append({**chunk, "doc": doc})
        ranked = [(chunk, 0) for chunk in get_relevant_chunks_keyword(all_chunks, question)]

    # Select top
    selected = []
    doc_count = {}
    total_len = 0
    for chunk_doc, score in ranked:
        doc_id = chunk_doc.metadata.get('doc_id')
        if doc_count.get(doc_id, 0) < CHUNKS_PER_DOC:
            text = chunk_doc.page_content
            if total_len + len(text) > MAX_CONTEXT_LENGTH:
                break
            # Reconstruct chunk dict
            chunk = {
                "text": text,
                "doc": doc_map[doc_id],
                "metadata": chunk_doc.metadata,
                "score": score
            }
            selected.append(chunk)
            doc_count[doc_id] = doc_count.get(doc_id, 0) + 1
            total_len += len(text)
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
        selected_chunks = await select_relevant_chunks(question, docs)
        print(f"Selected {len(selected_chunks)} chunks")
        if selected_chunks:
            print(f"Sample selected chunk: {selected_chunks[0]['text'][:100]}...")

        # Build context with metadata for citations
        context_parts = []
        for c in selected_chunks:
            doc_name = c["doc"].get("name", "Unknown Document")
            page = c.get("metadata", {}).get("page", "N/A")
            context_parts.append(f"[Source: {doc_name}, p.{page}]\n{c['text']}")
        context = "\n\n".join(context_parts)[:MAX_CONTEXT_LENGTH]
        print(f"Context length: {len(context)}")

        # Add optional user details
        user_details = ""
        if user_obj:
            user_details = (
                f"\n\nUser Info:\n"
                f"Name: {user_obj.get('name', 'Unknown')}\n"
                f"Email: {user_obj.get('email', 'Unknown')}\n"
                f"Role: {user_obj.get('role', 'Unknown')}"
            )

        # Structured system prompt
        prompt = f"""
        You are Oxy, an internal AI knowledge assistant of the company Oxytec Solutions Inc.

        ## Core Instructions
        - Always answer based **only** on the provided document context.
        - If you do not find relevant information, say:  
        "I couldn’t find enough details in the documents to answer that accurately."
        - Never invent information not present in the documents.
        - Keep answers clear, concise, and professional.

        ## Answer Structure
        1. **Direct Answer** → Provide the best possible answer from the documents.  
        2. **Supporting Evidence** → Show short quotes or paraphrases with document name + page number.  
        Example: (Source: SafetyManual.pdf, p.12)  
        3. **Suggested Follow-ups** → Offer 1–2 natural next questions the user might ask.

        ## Style & Tone
        - Use plain, accessible language unless technical detail is explicitly required.
        - Be confident but cautious: avoid speculation if evidence is weak.
        - Must use bullet points, headers, or tables for readability.

        ## Special Modes
        - If asked to summarize → Provide a short summary (3–5 sentences max).
        - If asked to compare → List similarities and differences in bullet points.
        - If asked for procedures → Return step-by-step instructions.

        ## Citations
        - Always attach source references with filename + page when available.
        - If multiple sources agree, cite them all.
        - If no page number exists, cite only the filename.

        ---
        Context from documents:
        {context}
        {user_details}

        User Question:
        {question}

        Answer:
        """.strip()
        
    # Call Ollama
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{OLLAMA_URL}/api/generate", json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}, timeout=60.0)
        if res.status_code != 200:
            return {"answer": f"Hello {user_obj.get('name', 'User')}! I'm Oxy, your AI assistant. How can I help you today?"}
        data = res.json()
        answer = data.get("response", f"Hello {user_obj.get('name', 'User')}! I'm Oxy, your AI assistant. How can I help you today?")
        return {"answer": answer}
