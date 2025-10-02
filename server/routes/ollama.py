from fastapi import APIRouter, HTTPException
import httpx
import os
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

@router.get("/status")
async def get_ollama_status():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")

        if response.status_code != 200:
            return {"online": False}

        data = response.json()
        return {
            "online": True,
            "models": data.get("models", [])
        }

    except Exception as e:
        logger.error(f"Ollama status check failed: {e}")
        return {"online": False}
