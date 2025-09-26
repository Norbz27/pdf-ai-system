from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Any, Dict, List
from ..services.retrieval import RetrievalService, MAX_CONTEXT_LENGTH
from ..core.config import settings
from langchain_community.llms import Ollama

router = APIRouter()
retrieval = RetrievalService()

@router.websocket("/ws/chat")
async def ws_chat(ws: WebSocket):
	await ws.accept()
	try:
		# Expect a JSON with { question, docIds?, user?, isFirstMessage? }
		payload = await ws.receive_json()
		question = payload.get('question')
		if not question:
			await ws.send_json({ 'error': 'Missing question' })
			await ws.close()
			return
		doc_ids: List[str] | None = payload.get('docIds')
		user = payload.get('user') if isinstance(payload.get('user'), dict) else None
		user_id = user.get('_id') if user else None
		user_role = user.get('role') if user else None
		docs = await retrieval.load_docs_for_user(doc_ids, user_id, user_role)
		selected = retrieval.select_chunks(docs, question)
		context = ("\n\n").join(c.get('text','') for c in selected)[:MAX_CONTEXT_LENGTH]
		prompt = retrieval.build_prompt(context, question, user, bool(payload.get('isFirstMessage')))
		llm = Ollama(base_url=settings.OLLAMA_URL, model=settings.OLLAMA_MODEL)
		for token in llm.stream(prompt):
			await ws.send_text(token)
		await ws.close()
	except WebSocketDisconnect:
		return
	except Exception as e:
		try:
			await ws.send_json({ 'error': 'Server error' })
		finally:
			await ws.close() 