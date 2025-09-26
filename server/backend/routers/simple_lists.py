from fastapi import APIRouter
from ..db.mongo import get_db
from bson import ObjectId

router = APIRouter()

@router.get("/categories")
async def list_categories():
	db = get_db()
	cursor = db['categories'].find({}, { 'name': 1 })
	items = [ { **doc, '_id': str(doc['_id']) } async for doc in cursor ]
	return { 'categories': items }

@router.get("/roles")
async def list_roles():
	db = get_db()
	cursor = db['roles'].find({}, { 'name': 1, 'permissions': 1 })
	items = [ { **doc, '_id': str(doc['_id']) } async for doc in cursor ]
	return { 'roles': items }

@router.get("/users")
async def list_users():
	db = get_db()
	cursor = db['users'].find({}, { 'name': 1, 'email': 1, 'roleId': 1, 'status': 1 })
	items = []
	async for doc in cursor:
		item = { **doc, '_id': str(doc['_id']) }
		if isinstance(item.get('roleId'), ObjectId):
			item['roleId'] = str(item['roleId'])
		items.append(item)
	return { 'users': items } 