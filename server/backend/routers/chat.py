from fastapi import APIRouter, HTTPException, Request
from typing import Any, Dict, List
from ..services.retrieval import RetrievalService, MAX_CONTEXT_LENGTH
from ..core.config import settings
from langchain_community.llms import Ollama
import time

router = APIRouter()
retrieval = RetrievalService()

@router.post("/chat")
async def chat(request: Request, body: Dict[str, Any]):
	question = body.get('question')
	if not question:
		raise HTTPException(status_code=400, detail={"message": "Missing question"})
	doc_ids: List[str] | None = body.get('docIds')
	cached_docs = body.get('cachedDocs')
	user = body.get('user')
	user_id = (user or {}).get('_id') if isinstance(user, dict) else None
	user_role = (user or {}).get('role') if isinstance(user, dict) else None

	normalized = question.strip().lower()
	list_intents = [
		"list documents", "list of documents", "show documents", "what documents do you have", "what files are uploaded", "show me the documents", "which documents are available", "which files do you know", "what files do you know", "what documents are there", "give me a list of documents", "give me a list of files", "show all documents", "show all files"
	]
	if any(intent in normalized for intent in list_intents):
		docs = await retrieval.load_docs_for_user(doc_ids, user_id, user_role)
		doc_list = [{ 'id': str(d['_id']), 'name': d.get('name') or d.get('originalname') or d.get('filename') or d.get('title') or 'Untitled Document' } for d in docs]
		if len(doc_list) == 0:
			answer = "I currently don't have any documents uploaded."
		elif len(doc_list) == 1:
			answer = f"I have one document: {doc_list[0]['name']}"
		else:
			answer = "Here are the documents I know about:\n" + "\n".join(f"{i+1}. {d['name']}" for i, d in enumerate(doc_list))
		return { 'answer': answer }

	greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "__greeting__"]
	if normalized in greetings:
		prompt = f"You are Oxy, a friendly AI assistant. Greet the user and offer help. Be concise."
		if normalized == "__greeting__" and isinstance(user, dict):
			prompt = f"Greet the user by name and introduce yourself as Oxy, their AI assistant. Mention you can help with their uploaded documents, generate summaries, and answer questions. Personalize the greeting for: Name: {user.get('name','User')}, Role: {user.get('role','Unknown')}.  Be concise"
		start = time.time()
		llm = Ollama(base_url=settings.OLLAMA_URL, model=settings.OLLAMA_MODEL)
		resp = llm.invoke(prompt)
		print("Ollama latency ms:", int((time.time()-start)*1000))
		return { 'answer': resp or f"Hello {user.get('name','User') if isinstance(user, dict) else 'User'}! I'm Oxy, your AI assistant. How can I help you today?" }

	# Redis cache check
	from ..cache.redis import cache_get_json, cache_set_json
	cache_key = None
	if user_id:
		cache_key = f"ans:{user_id}:{','.join(doc_ids or [])}:{normalized[:64]}"
	if cache_key:
		cached = await cache_get_json(cache_key)
		if cached and cached.get('answer'):
			return cached
	docs = await retrieval.load_docs_for_user(doc_ids, user_id, user_role)
	selected = retrieval.select_chunks(docs, question)
	context = ("\n\n").join(c.get('text','') for c in selected)[:MAX_CONTEXT_LENGTH]
	prompt = retrieval.build_prompt(context, question, user if isinstance(user, dict) else None, bool(body.get('isFirstMessage')))
	llm = Ollama(base_url=settings.OLLAMA_URL, model=settings.OLLAMA_MODEL)
	start = time.time()
	resp = llm.invoke(prompt)
	print("Ollama latency ms:", int((time.time()-start)*1000))
	result = { 'answer': resp or f"Hello {user.get('name','User') if isinstance(user, dict) else 'User'}! I'm Oxy, your AI assistant. How can I help you today?" }
	if cache_key:
		await cache_set_json(cache_key, result, ttl_seconds=300)
	return result 