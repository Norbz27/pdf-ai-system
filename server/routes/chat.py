from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Request, Body
from fastapi.responses import StreamingResponse
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
import json
import re
from typing import List, Dict, Any

router = APIRouter()

MAX_CONTEXT_LENGTH = 1500
FORMS_CONTEXT_LENGTH = 2500
CHUNKS_PER_DOC = 3
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://192.168.0.191:11434")
OLLAMA_MODEL = "llama3.2:3b-instruct-q4_K_M"
OLLAMA_TEMPERATURE = 0.1
OLLAMA_NUM_PREDICT = 256

BASE_INSTRUCTIONS = """
You are Oxy, the internal AI assistant of Oxytec Solutions Inc.

- You must answer **only** using the provided document context.
- If the context does not contain the answer, reply: 
  "The requested information is not available in the company documents."
- If you have given an answer and not sure, say "I'm not certain, please verify with company resources."
- Do not refuse or give general safety disclaimers.
- Never invent or assume information not in the documents.
- Always cite the document name and page number when possible.
- Use company name Oxytec Solutions Inc. in answers when relevant.
"""

FORMS_INSTRUCTIONS = """
You are Oxy, the internal AI assistant of Oxytec Solutions Inc.

Answer the question about forms using ONLY the context below.

Format:
**[Form Name]**
**Link**: [URL from context]
**Source**: [Document name], p.[page]

Be concise. If not found, say: "Form not available in directory."
"""

ANSWER_GUIDE = """
Answer Structure

- Provide the best possible answer from the documents, add headers if possible.  
- Show short quotes or paraphrases with document name + page number.  
Example: (Source: SafetyManual.pdf, p.12)  
"""

FORMS_ANSWER_GUIDE = """
Copy URLs directly from context. Be brief.
"""

# In-memory cache for embeddings
embedding_cache: Dict[str, List[float]] = {}
EMBEDDING_CACHE_MAX_SIZE = 100

async def get_embedding(text: str) -> List[float]:
    """Get embedding with caching support"""
    normalized_text = " ".join(text.lower().split())
    
    if normalized_text in embedding_cache:
        print(f"Cache hit for embedding query")
        return embedding_cache[normalized_text]
    
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{OLLAMA_URL}/api/embeddings", 
            json={"model": "nomic-embed-text", "prompt": text}, 
            timeout=20.0
        )
        if res.status_code != 200:
            raise Exception(f"Embedding API error: {res.status_code}")
        data = res.json()
        embedding = data.get("embedding", [])
    
    if len(embedding_cache) >= EMBEDDING_CACHE_MAX_SIZE:
        first_key = next(iter(embedding_cache))
        del embedding_cache[first_key]
    
    embedding_cache[normalized_text] = embedding
    print(f"Cached new embedding (cache size: {len(embedding_cache)})")
    
    return embedding

def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0

def get_relevant_chunks_keyword(chunks: List[Dict], question: str) -> List[Dict]:
    keywords = question.lower().split()
    return sorted(chunks, key=lambda c: sum(1 for w in keywords if w in c["text"].lower()), reverse=True)

def is_forms_query(question: str) -> bool:
    """Detect if user is asking about forms, links, directories, or templates"""
    forms_keywords = [
        'form', 'forms', 'link', 'links', 'directory', 'directories',
        'template', 'templates', 'where can i find', 'where is',
        'how do i access', 'how to access', 'how can i get',
        'requisition', 'application', 'request form', 'worksheet',
        'checklist', 'document template', 'fillable', 'download',
        'list of forms', 'available forms', 'form directory'
    ]
    question_lower = question.lower()
    return any(keyword in question_lower for keyword in forms_keywords)

def extract_urls(text: str) -> List[str]:
    """Extract URLs from text"""
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    return re.findall(url_pattern, text)

async def select_relevant_chunks(question: str, docs: List[Dict], is_forms: bool = False) -> List[Dict]:
    if not docs:
        print("No docs provided")
        return []

    allowed_ids = {str(doc["_id"]) for doc in docs}
    doc_map = {str(doc["_id"]): doc for doc in docs}
    print(f"Allowed doc IDs: {allowed_ids}")
    print(f"Number of docs: {len(docs)}")
    print(f"Is forms query: {is_forms}")

    for doc in docs:
        chunks = doc.get("chunks", [])
        print(f"Doc {doc['_id']}: {len(chunks)} chunks")
        if chunks:
            print(f"Sample chunk text: {chunks[0].get('text', '')[:100]}...")

    vector_store = await load_faiss_index()
    if not vector_store:
        all_chunks = []
        for doc in docs:
            for chunk in doc.get("chunks", []):
                all_chunks.append({**chunk, "doc": doc})
        ranked = get_relevant_chunks_keyword(all_chunks, question)
        max_chunks = CHUNKS_PER_DOC * 2 if is_forms else CHUNKS_PER_DOC
        return ranked[:max_chunks]

    try:
        k = CHUNKS_PER_DOC * 2 if is_forms else CHUNKS_PER_DOC
        retrieval_k = k * 3
        results = vector_store.similarity_search_with_score(question, k=retrieval_k)
        print(f"FAISS search returned {len(results)} results (before filtering)")

        selected = []
        filtered_out = 0
        
        for chunk_doc, score in results:
            doc_id = chunk_doc.metadata.get('doc_id')
            
            if doc_id not in allowed_ids:
                filtered_out += 1
                continue
            
            if doc_id not in doc_map:
                filtered_out += 1
                continue

            max_chunk_length = 800 if is_forms else 500
            context_limit = FORMS_CONTEXT_LENGTH if is_forms else MAX_CONTEXT_LENGTH
            
            text = chunk_doc.page_content[:max_chunk_length]
            if len(text) + sum(len(c["text"]) for c in selected) <= context_limit:
                selected.append({
                    "text": text,
                    "doc": doc_map[doc_id],
                    "metadata": chunk_doc.metadata,
                    "score": score
                })

            if len(selected) >= k:
                break
        
        print(f"Filtered out {filtered_out} chunks from other documents")
        print(f"Selected {len(selected)} chunks from allowed documents")
        return selected

    except Exception as e:
        print(f"FAISS search failed: {e}")
        return []

def build_prompt(context: str, question: str, user_details: str = "", is_forms: bool = False) -> str:
    instructions = FORMS_INSTRUCTIONS if is_forms else BASE_INSTRUCTIONS
    guide = FORMS_ANSWER_GUIDE if is_forms else ANSWER_GUIDE
    
    return f"""
{instructions}

{guide}

Context:
{context}

User Details:
{user_details}

Question:
{question}

Answer:
""".strip()

def clean_answer(answer: str) -> str:
    lines = answer.strip().splitlines()
    cleaned = [l for l in lines if "as an ai" not in l.lower()]
    return "\n".join(cleaned)


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming chat"""
    
    token = websocket.query_params.get("token")
    
    if not token:
        await websocket.close(code=1008, reason="Authentication token required")
        return
    
    try:
        import jwt
        from server.config import settings
        import os
        
        secret_key = getattr(settings, 'SECRET_KEY', None) or \
                     getattr(settings, 'JWT_SECRET_KEY', None) or \
                     getattr(settings, 'secret_key', None) or \
                     os.getenv('SECRET_KEY') or \
                     os.getenv('JWT_SECRET')
        
        if not secret_key:
            print("ERROR: No SECRET_KEY found in settings")
            await websocket.close(code=1008, reason="Server configuration error")
            return
        
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        user_id = payload.get("userId")
        
        if not user_id:
            await websocket.close(code=1008, reason="Invalid token payload")
            return
            
        user = {"user_id": user_id, "permissions": payload.get("permissions", [])}
        
    except jwt.ExpiredSignatureError:
        await websocket.close(code=1008, reason="Token expired")
        return
    except jwt.InvalidTokenError as e:
        print(f"Authentication failed: {e}")
        await websocket.close(code=1008, reason="Invalid authentication token")
        return
    
    await websocket.accept()
    await websocket.send_json({"type": "connected", "message": "WebSocket connected"})
    
    try:
        while True:
            data = await websocket.receive_json()
            
            question = data.get("question", "")
            docIds = data.get("docIds", [])
            user_obj = data.get("user", {})
            
            if not question.strip():
                await websocket.send_json({"type": "error", "message": "Missing question"})
                continue
            
            print(f"--- WebSocket Chat Request ---")
            print(f"Question: {question}")
            print(f"DocIds: {docIds}")
            
            is_forms = is_forms_query(question)
            print(f"Is forms query: {is_forms}")
            
            user_id_str = user_obj.get("_id") or user.get("user_id")
            user_id = ObjectId(user_id_str) if user_id_str and ObjectId.is_valid(user_id_str) else None
            user_role = user_obj.get("role") or user.get("role")
            
            db = await get_database()
            
            category_filter = {}
            if is_forms:
                forms_category = await db["categories"].find_one({"name": "Forms Directory"})
                if forms_category:
                    category_filter = {"categoryId": forms_category["_id"]}
                    print(f"Filtering for Forms Directory category: {forms_category['_id']}")
                    total_in_category = await db["documents"].count_documents(category_filter)
                    print(f"Total documents in Forms Directory: {total_in_category}")
                    
                    if total_in_category == 0:
                        print("No documents found with Forms Directory categoryId, trying name/description search...")
                        category_filter = {
                            "$or": [
                                {"name": {"$regex": "form", "$options": "i"}},
                                {"description": {"$regex": "form", "$options": "i"}},
                                {"name": {"$regex": "directory", "$options": "i"}},
                                {"description": {"$regex": "directory", "$options": "i"}}
                            ]
                        }
            
            access_conditions = []
            if user_id:
                access_conditions = [
                    {"uploadedBy": user_id}, 
                    {"sharedWith": {"$in": [user_id]}},
                    {"publicAccess": True}
                ]
                if user_role:
                    access_conditions.append({"accessGrants": {"$elemMatch": {"type": "role", "value": user_role}}})
            
            if docIds:
                id_filter = {"_id": {"$in": [ObjectId(did) for did in docIds if ObjectId.is_valid(did)]}}
                combined_filter = {**id_filter, **category_filter}
                if access_conditions:
                    combined_filter["$or"] = access_conditions
                docs = await db["documents"].find(combined_filter).to_list(length=None)
            else:
                combined_filter = {**category_filter}
                if access_conditions:
                    combined_filter["$or"] = access_conditions
                else:
                    combined_filter["publicAccess"] = True
                docs = await db["documents"].find(combined_filter).to_list(length=None)
            
            doc_names = [d.get("name", "Untitled") for d in docs]
            print(f"Documents involved: {doc_names}")
            
            selected_chunks = await select_relevant_chunks(question, docs, is_forms)
            
            if not selected_chunks:
                error_msg = "The requested form is not available in the Forms Directory." if is_forms else "The requested information is not available in the company documents."
                await websocket.send_json({"type": "complete", "answer": error_msg})
                continue
            
            print(f"Selected {len(selected_chunks)} chunks")
            
            context_parts = []
            all_urls = []
            
            for i, c in enumerate(selected_chunks):
                doc_name = c["doc"].get("name", "Unknown Document")
                page = c.get("metadata", {}).get("page", "N/A")
                max_length = 800 if is_forms else 500
                text = c["text"][:max_length]
                
                if is_forms:
                    urls = extract_urls(text)
                    all_urls.extend(urls)
                    print(f"Chunk {i+1}: Found {len(urls)} URLs")
                
                print(f"Chunk {i+1}: [Source: {doc_name}, p.{page}]")
                context_parts.append(f"[Source: {doc_name}, p.{page}]\n{text}")
            
            context = "\n\n".join(context_parts)
            
            if is_forms and all_urls:
                unique_urls = list(set(all_urls))
                context += f"\n\n[Extracted Links]:\n" + "\n".join(unique_urls)
                print(f"Total unique URLs extracted: {len(unique_urls)}")
                print(f"URLs: {unique_urls}")
            else:
                unique_urls = []
            
            user_details = ""
            if user_obj:
                user_details = (
                    f"Name: {user_obj.get('name', 'Unknown')}\n"
                    f"Email: {user_obj.get('email', 'Unknown')}\n"
                    f"Role: {user_obj.get('role', 'Unknown')}"
                )
            
            prompt = build_prompt(context, question, user_details, is_forms)
            print(f"Prompt length: {len(prompt)} chars")
            
            ollama_params = {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": True,
                "options": {
                    "temperature": OLLAMA_TEMPERATURE,
                    "top_p": 0.9,
                    "top_k": 40,
                }
            }
            
            if is_forms:
                ollama_params["options"]["num_predict"] = OLLAMA_NUM_PREDICT
            
            await websocket.send_json({
                "type": "metadata",
                "isFormsQuery": is_forms,
                "documentsSearched": len(docs),
                "category": "Forms Directory" if is_forms else "General",
                "linksFound": unique_urls
            })
            
            final_answer = ""
            async with httpx.AsyncClient() as client:
                async with client.stream("POST", f"{OLLAMA_URL}/api/generate",
                                         json=ollama_params,
                                         timeout=60.0) as res:
                    if res.status_code != 200:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Error: Unable to fetch response from model."
                        })
                        continue
                    
                    async for line in res.aiter_lines():
                        if line.strip():
                            try:
                                data_json = json.loads(line)
                                token = data_json.get("response", "")
                                final_answer += token
                                
                                await websocket.send_json({
                                    "type": "token",
                                    "token": token
                                })
                                
                                if data_json.get("done", False):
                                    break
                            except Exception as e:
                                print(f"Error parsing token: {e}")
            
            cleaned_answer = clean_answer(final_answer)
            
            if is_forms and all_urls:
                has_real_url = any(url in cleaned_answer for url in unique_urls)
                has_example_url = "example.com" in cleaned_answer.lower()
                says_not_available = "not available" in cleaned_answer.lower() or "not found" in cleaned_answer.lower()
                
                if not has_real_url or has_example_url or says_not_available:
                    print("WARNING: LLM response incomplete, building proper answer from context")
                    
                    lines = context.split('\n')
                    form_links = []
                    current_form = None
                    
                    for line in lines:
                        line = line.strip()
                        if line and not line.startswith('[') and not line.startswith('http'):
                            if any(keyword in line.lower() for keyword in ['form', 'request', 'order', 'application', 'template']):
                                current_form = line
                        elif line.startswith('http') and current_form:
                            form_links.append((current_form, line))
                            current_form = None
                    
                    if form_links:
                        cleaned_answer = "Here are the available forms:\n\n"
                        for form_name, url in form_links:
                            query_lower = question.lower()
                            form_lower = form_name.lower()
                            if any(word in form_lower for word in query_lower.split() if len(word) > 3):
                                cleaned_answer += f"**{form_name}**\n**Link**: {url}\n**Source**: {doc_names[0]}, p.0\n\n"
                                break
                        else:
                            for form_name, url in form_links:
                                cleaned_answer += f"**{form_name}**\n**Link**: {url}\n\n"
                        
                        cleaned_answer += f"**Source**: {doc_names[0]}, p.0"
            
            await websocket.send_json({
                "type": "complete",
                "answer": cleaned_answer,
                "isFormsQuery": is_forms,
                "documentsSearched": len(docs),
                "category": "Forms Directory" if is_forms else "General",
                "linksFound": unique_urls
            })
            
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass


@router.post("/stream")
async def chat_stream_endpoint(body: ChatRequest, user=Depends(JWTBearer())):
    """HTTP Streaming endpoint using Server-Sent Events (SSE)"""
    
    async def event_generator():
        try:
            question = body.question
            docIds = body.docIds or []
            user_obj = body.user or {}

            print(f"--- Chat Stream Request ---")
            print(f"Question: {question}")
            print(f"DocIds: {docIds}")

            if not question.strip():
                yield f"data: {json.dumps({'error': 'Missing question'})}\n\n"
                return

            is_forms = is_forms_query(question)
            print(f"Is forms query: {is_forms}")

            user_id_str = user_obj.get("_id")
            user_id = ObjectId(user_id_str) if user_id_str and ObjectId.is_valid(user_id_str) else None
            user_role = user_obj.get("role")

            db = await get_database()

            category_filter = {}
            if is_forms:
                forms_category = await db["categories"].find_one({"name": "Forms Directory"})
                if forms_category:
                    category_filter = {"categoryId": forms_category["_id"]}
                    print(f"Filtering for Forms Directory category: {forms_category['_id']}")
                    
                    total_in_category = await db["documents"].count_documents(category_filter)
                    print(f"Total documents in Forms Directory: {total_in_category}")
                    
                    if total_in_category == 0:
                        print("No documents found with Forms Directory categoryId, trying name/description search...")
                        category_filter = {
                            "$or": [
                                {"name": {"$regex": "form", "$options": "i"}},
                                {"description": {"$regex": "form", "$options": "i"}},
                                {"name": {"$regex": "directory", "$options": "i"}},
                                {"description": {"$regex": "directory", "$options": "i"}}
                            ]
                        }
                else:
                    print("Warning: Forms Directory category not found in database")
            
            access_conditions = []
            if user_id:
                access_conditions = [
                    {"uploadedBy": user_id}, 
                    {"sharedWith": {"$in": [user_id]}},
                    {"publicAccess": True}
                ]
                if user_role:
                    access_conditions.append({"accessGrants": {"$elemMatch": {"type": "role", "value": user_role}}})
            
            if docIds:
                id_filter = {"_id": {"$in": [ObjectId(did) for did in docIds if ObjectId.is_valid(did)]}}
                combined_filter = {**id_filter, **category_filter}
                
                if access_conditions:
                    combined_filter["$or"] = access_conditions
                
                docs = await db["documents"].find(combined_filter).to_list(length=None)
            else:
                combined_filter = {**category_filter}
                
                if access_conditions:
                    combined_filter["$or"] = access_conditions
                else:
                    combined_filter["publicAccess"] = True
                
                print(f"Combined filter: {combined_filter}")
                docs = await db["documents"].find(combined_filter).to_list(length=None)
                print(f"Documents found: {len(docs)}")

            doc_names = [d.get("name", "Untitled") for d in docs]
            print(f"Documents involved: {doc_names}")

            selected_chunks = await select_relevant_chunks(question, docs, is_forms)

            if not selected_chunks:
                error_msg = "The requested form is not available in the Forms Directory." if is_forms else "The requested information is not available in the company documents."
                yield f"data: {json.dumps({'type': 'complete', 'answer': error_msg})}\n\n"
                return

            print(f"Selected {len(selected_chunks)} chunks")
            
            context_parts = []
            all_urls = []
            
            for i, c in enumerate(selected_chunks):
                doc_name = c["doc"].get("name", "Unknown Document")
                page = c.get("metadata", {}).get("page", "N/A")
                max_length = 800 if is_forms else 500
                text = c["text"][:max_length]
                
                if is_forms:
                    urls = extract_urls(text)
                    all_urls.extend(urls)
                    print(f"Chunk {i+1}: Found {len(urls)} URLs")
                
                print(f"Chunk {i+1}: [Source: {doc_name}, p.{page}]")
                context_parts.append(f"[Source: {doc_name}, p.{page}]\n{text}")
            
            context = "\n\n".join(context_parts)
            
            if is_forms and all_urls:
                unique_urls = list(set(all_urls))
                context += f"\n\n[Extracted Links]:\n" + "\n".join(unique_urls)
                print(f"Total unique URLs extracted: {len(unique_urls)}")
                print(f"URLs: {unique_urls}")
            else:
                unique_urls = []

            user_details = ""
            if user_obj:
                user_details = (
                    f"Name: {user_obj.get('name', 'Unknown')}\n"
                    f"Email: {user_obj.get('email', 'Unknown')}\n"
                    f"Role: {user_obj.get('role', 'Unknown')}"
                )

            prompt = build_prompt(context, question, user_details, is_forms)
            print(f"Prompt length: {len(prompt)} chars")

            # Send metadata first
            yield f"data: {json.dumps({'type': 'metadata', 'isFormsQuery': is_forms, 'documentsSearched': len(docs), 'linksFound': unique_urls})}\n\n"

            ollama_params = {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": True,
                "options": {
                    "temperature": OLLAMA_TEMPERATURE,
                    "top_p": 0.9,
                    "top_k": 40,
                }
            }
            
            if is_forms:
                ollama_params["options"]["num_predict"] = OLLAMA_NUM_PREDICT
            
            final_answer = ""
            async with httpx.AsyncClient() as client:
                async with client.stream("POST", f"{OLLAMA_URL}/api/generate",
                                         json=ollama_params,
                                         timeout=60.0) as res:
                    if res.status_code != 200:
                        yield f"data: {json.dumps({'type': 'error', 'message': 'Error: Unable to fetch response from model.'})}\n\n"
                        return

                    async for line in res.aiter_lines():
                        if line.strip():
                            try:
                                data = json.loads(line)
                                token = data.get("response", "")
                                final_answer += token
                                
                                # Stream each token immediately
                                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
                                
                                if data.get("done", False):
                                    break
                            except Exception as e:
                                print(f"Error parsing token: {e}")

            cleaned_answer = clean_answer(final_answer)
            
            # Post-process for forms
            if is_forms and all_urls:
                has_real_url = any(url in cleaned_answer for url in unique_urls)
                has_example_url = "example.com" in cleaned_answer.lower()
                says_not_available = "not available" in cleaned_answer.lower() or "not found" in cleaned_answer.lower()
                
                if not has_real_url or has_example_url or says_not_available:
                    print("WARNING: LLM response incomplete, building proper answer from context")
                    
                    lines = context.split('\n')
                    form_links = []
                    current_form = None
                    
                    for line in lines:
                        line = line.strip()
                        if line and not line.startswith('[') and not line.startswith('http'):
                            if any(keyword in line.lower() for keyword in ['form', 'request', 'order', 'application', 'template']):
                                current_form = line
                        elif line.startswith('http') and current_form:
                            form_links.append((current_form, line))
                            current_form = None
                    
                    if form_links:
                        cleaned_answer = "Here are the available forms:\n\n"
                        for form_name, url in form_links:
                            query_lower = question.lower()
                            form_lower = form_name.lower()
                            if any(word in form_lower for word in query_lower.split() if len(word) > 3):
                                cleaned_answer += f"**{form_name}**\n**Link**: {url}\n**Source**: {doc_names[0]}, p.0\n\n"
                                break
                        else:
                            for form_name, url in form_links:
                                cleaned_answer += f"**{form_name}**\n**Link**: {url}\n\n"
                        
                        cleaned_answer += f"**Source**: {doc_names[0]}, p.0"
            
            # Send completion
            yield f"data: {json.dumps({'type': 'complete', 'answer': cleaned_answer, 'isFormsQuery': is_forms, 'documentsSearched': len(docs), 'linksFound': unique_urls})}\n\n"
            
        except Exception as e:
            print(f"Error in stream: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("")
async def chat_endpoint(body: ChatRequest, user=Depends(JWTBearer())):
    """Streaming endpoint using Server-Sent Events (SSE)"""

    async def event_generator():
        try:
            question = body.question
            docIds = body.docIds or []
            user_obj = body.user or {}

            print(f"--- Chat Stream Request ---")
            print(f"Question: {question}")
            print(f"DocIds: {docIds}")

            if not question.strip():
                yield f"data: {json.dumps({'error': 'Missing question'})}\n\n"
                return

            is_forms = is_forms_query(question)
            print(f"Is forms query: {is_forms}")

            user_id_str = user_obj.get("_id")
            user_id = ObjectId(user_id_str) if user_id_str and ObjectId.is_valid(user_id_str) else None
            user_role = user_obj.get("role")

            db = await get_database()

            category_filter = {}
            if is_forms:
                forms_category = await db["categories"].find_one({"name": "Forms Directory"})
                if forms_category:
                    category_filter = {"categoryId": forms_category["_id"]}
                    print(f"Filtering for Forms Directory category: {forms_category['_id']}")

                    total_in_category = await db["documents"].count_documents(category_filter)
                    print(f"Total documents in Forms Directory: {total_in_category}")

                    if total_in_category == 0:
                        print("No documents found with Forms Directory categoryId, trying name/description search...")
                        category_filter = {
                            "$or": [
                                {"name": {"$regex": "form", "$options": "i"}},
                                {"description": {"$regex": "form", "$options": "i"}},
                                {"name": {"$regex": "directory", "$options": "i"}},
                                {"description": {"$regex": "directory", "$options": "i"}}
                            ]
                        }
                else:
                    print("Warning: Forms Directory category not found in database")

            access_conditions = []
            if user_id:
                access_conditions = [
                    {"uploadedBy": user_id},
                    {"sharedWith": {"$in": [user_id]}},
                    {"publicAccess": True}
                ]
                if user_role:
                    access_conditions.append({"accessGrants": {"$elemMatch": {"type": "role", "value": user_role}}})

            if docIds:
                id_filter = {"_id": {"$in": [ObjectId(did) for did in docIds if ObjectId.is_valid(did)]}}
                combined_filter = {**id_filter, **category_filter}

                if access_conditions:
                    combined_filter["$or"] = access_conditions

                docs = await db["documents"].find(combined_filter).to_list(length=None)
            else:
                combined_filter = {**category_filter}

                if access_conditions:
                    combined_filter["$or"] = access_conditions
                else:
                    combined_filter["publicAccess"] = True

                print(f"Combined filter: {combined_filter}")
                docs = await db["documents"].find(combined_filter).to_list(length=None)
                print(f"Documents found: {len(docs)}")

            doc_names = [d.get("name", "Untitled") for d in docs]
            print(f"Documents involved: {doc_names}")

            selected_chunks = await select_relevant_chunks(question, docs, is_forms)

            if not selected_chunks:
                error_msg = "The requested form is not available in the Forms Directory." if is_forms else "The requested information is not available in the company documents."
                yield f"data: {json.dumps({'type': 'complete', 'answer': error_msg})}\n\n"
                return

            print(f"Selected {len(selected_chunks)} chunks")

            context_parts = []
            all_urls = []

            for i, c in enumerate(selected_chunks):
                doc_name = c["doc"].get("name", "Unknown Document")
                page = c.get("metadata", {}).get("page", "N/A")
                max_length = 800 if is_forms else 500
                text = c["text"][:max_length]

                if is_forms:
                    urls = extract_urls(text)
                    all_urls.extend(urls)
                    print(f"Chunk {i+1}: Found {len(urls)} URLs")

                print(f"Chunk {i+1}: [Source: {doc_name}, p.{page}]")
                context_parts.append(f"[Source: {doc_name}, p.{page}]\n{text}")

            context = "\n\n".join(context_parts)

            if is_forms and all_urls:
                unique_urls = list(set(all_urls))
                context += f"\n\n[Extracted Links]:\n" + "\n".join(unique_urls)
                print(f"Total unique URLs extracted: {len(unique_urls)}")
                print(f"URLs: {unique_urls}")
            else:
                unique_urls = []

            user_details = ""
            if user_obj:
                user_details = (
                    f"Name: {user_obj.get('name', 'Unknown')}\n"
                    f"Email: {user_obj.get('email', 'Unknown')}\n"
                    f"Role: {user_obj.get('role', 'Unknown')}"
                )

            prompt = build_prompt(context, question, user_details, is_forms)
            print(f"Prompt length: {len(prompt)} chars")

            # Send metadata first
            yield f"data: {json.dumps({'type': 'metadata', 'isFormsQuery': is_forms, 'documentsSearched': len(docs), 'linksFound': unique_urls})}\n\n"

            ollama_params = {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": True,
                "options": {
                    "temperature": OLLAMA_TEMPERATURE,
                    "top_p": 0.9,
                    "top_k": 40,
                }
            }

            if is_forms:
                ollama_params["options"]["num_predict"] = OLLAMA_NUM_PREDICT

            final_answer = ""
            async with httpx.AsyncClient() as client:
                async with client.stream("POST", f"{OLLAMA_URL}/api/generate",
                                         json=ollama_params,
                                         timeout=60.0) as res:
                    if res.status_code != 200:
                        yield f"data: {json.dumps({'type': 'error', 'message': 'Error: Unable to fetch response from model.'})}\n\n"
                        return

                    async for line in res.aiter_lines():
                        if line.strip():
                            try:
                                data = json.loads(line)
                                token = data.get("response", "")
                                final_answer += token

                                # Stream each token immediately
                                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

                                if data.get("done", False):
                                    break
                            except Exception as e:
                                print(f"Error parsing token: {e}")

            cleaned_answer = clean_answer(final_answer)

            # Post-process for forms
            if is_forms and all_urls:
                has_real_url = any(url in cleaned_answer for url in unique_urls)
                has_example_url = "example.com" in cleaned_answer.lower()
                says_not_available = "not available" in cleaned_answer.lower() or "not found" in cleaned_answer.lower()

                if not has_real_url or has_example_url or says_not_available:
                    print("WARNING: LLM response incomplete, building proper answer from context")

                    lines = context.split('\n')
                    form_links = []
                    current_form = None

                    for line in lines:
                        line = line.strip()
                        if line and not line.startswith('[') and not line.startswith('http'):
                            if any(keyword in line.lower() for keyword in ['form', 'request', 'order', 'application', 'template']):
                                current_form = line
                        elif line.startswith('http') and current_form:
                            form_links.append((current_form, line))
                            current_form = None

                    if form_links:
                        cleaned_answer = "Here are the available forms:\n\n"
                        for form_name, url in form_links:
                            query_lower = question.lower()
                            form_lower = form_name.lower()
                            if any(word in form_lower for word in query_lower.split() if len(word) > 3):
                                cleaned_answer += f"**{form_name}**\n**Link**: {url}\n**Source**: {doc_names[0]}, p.0\n\n"
                                break
                        else:
                            for form_name, url in form_links:
                                cleaned_answer += f"**{form_name}**\n**Link**: {url}\n\n"

                        cleaned_answer += f"**Source**: {doc_names[0]}, p.0"

            # Send completion
            yield f"data: {json.dumps({'type': 'complete', 'answer': cleaned_answer, 'isFormsQuery': is_forms, 'documentsSearched': len(docs), 'linksFound': unique_urls})}\n\n"

        except Exception as e:
            print(f"Error in stream: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
