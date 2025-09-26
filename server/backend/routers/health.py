from fastapi import APIRouter
from ..db.mongo import get_db
from ..core.config import settings
import httpx

router = APIRouter()

@router.get("/live")
async def live():
	return {"status": "ok"}

@router.get("/ready")
async def ready():
	# Mongo
	db = get_db()
	await db.command("ping")
	# Ollama
	try:
		async with httpx.AsyncClient(timeout=5.0) as client:
			res = await client.get(f"{settings.OLLAMA_URL}/api/tags")
			if res.status_code >= 400:
				raise RuntimeError("Ollama not ready")
	except Exception as e:
		return {"status": "degraded", "ollama": str(e)}
	return {"status": "ok"} 