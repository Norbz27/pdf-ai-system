from __future__ import annotations
from typing import Any, Optional
import json
import asyncio
import redis.asyncio as redis
from ..core.config import settings

_client: Optional[redis.Redis] = None

async def get_client() -> Optional[redis.Redis]:
	global _client
	if not settings.REDIS_URL:
		return None
	if _client is None:
		_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
	return _client

async def cache_get_json(key: str) -> Optional[Any]:
	client = await get_client()
	if not client:
		return None
	val = await client.get(key)
	if not val:
		return None
	try:
		return json.loads(val)
	except Exception:
		return None

async def cache_set_json(key: str, value: Any, ttl_seconds: int = 600) -> None:
	client = await get_client()
	if not client:
		return
	try:
		await client.set(key, json.dumps(value), ex=ttl_seconds)
	except Exception:
		return 