from fastapi import APIRouter, HTTPException, Request, Depends
from bson import ObjectId
from typing import Any, Dict, List
from ..db.mongo import get_db
from ..auth.deps import get_current_user

router = APIRouter()

@router.post("/documents/{id}/access")
async def add_access(id: str, body: Dict[str, Any], request: Request, requester = Depends(get_current_user)):
	db = get_db()
	if not id or not ObjectId.is_valid(id):
		raise HTTPException(status_code=400, detail={"error": "Invalid document id"})
	doc_id = ObjectId(id)
	# Load document
	document = await db["documents"].find_one({"_id": doc_id})
	if not document:
		raise HTTPException(status_code=404, detail={"error": "Document not found"})
	# Authorization: owner or admin
	is_owner = str(document.get("uploadedBy")) == str(requester.get("_id"))
	permissions = (requester.get("role") or {}).get("permissions") or []
	is_admin = "admin_access" in permissions
	if not (is_owner or is_admin):
		raise HTTPException(status_code=403, detail={"error": "Forbidden"})

	type_ = body.get("type")
	values = body.get("values")
	if type_ not in ("name", "role"):
		raise HTTPException(status_code=400, detail={"error": 'Invalid type. Must be "name" or "role"'})
	if not isinstance(values, list) or len(values) == 0:
		raise HTTPException(status_code=400, detail={"error": 'Type and non-empty values array are required'})
	if len(values) > 100:
		raise HTTPException(status_code=400, detail={"error": 'Too many values. Maximum allowed is 100'})

	user_ids_to_add: List[ObjectId] = []
	grant_entries_to_add: List[Dict[str, Any]] = []
	now = request.state.now if hasattr(request.state, 'now') else None

	if type_ == 'name':
		for name in values:
			if not isinstance(name, str) or not name.strip():
				continue
			target_user = await db['users'].find_one({"name": name})
			if target_user:
				user_ids_to_add.append(target_user["_id"])
				if not any((g.get('type') == 'user' and g.get('value') == name) for g in (document.get('accessGrants') or [])):
					grant_entries_to_add.append({"type": 'user', "value": name, "grantedAt": now or None})
		if len(user_ids_to_add) == 0:
			raise HTTPException(status_code=400, detail={"error": 'No matching users found for provided names'})
	elif type_ == 'role':
		for role_name in values:
			if not isinstance(role_name, str) or not role_name.strip():
				continue
			target_role = await db['roles'].find_one({"name": role_name})
			if not target_role:
				raise HTTPException(status_code=400, detail={"error": f'Role not found: {role_name}'})
			users_in_role = db['users'].find({"roleId": target_role["_id"]}, {"_id": 1})
			user_ids_to_add.extend([u["_id"] async for u in users_in_role])
			if not any((g.get('type') == 'role' and g.get('value') == role_name) for g in (document.get('accessGrants') or [])):
				grant_entries_to_add.append({"type": 'role', "value": role_name, "grantedAt": now or None})
		if len(user_ids_to_add) == 0:
			raise HTTPException(status_code=400, detail={"error": 'No users found for provided roles'})

	# Deduplicate
	unique_user_ids = list({str(_id): _id for _id in user_ids_to_add}.values())
	update_ops: Dict[str, Any] = {"$addToSet": {"sharedWith": {"$each": unique_user_ids}}}
	existing_grants = document.get('accessGrants') or []
	existing_key = set(f"{g.get('type')}:{g.get('value')}" for g in existing_grants)
	new_grants = [g for g in grant_entries_to_add if f"{g['type']}:{g['value']}" not in existing_key]
	if len(new_grants) > 0:
		update_ops["$set"] = {"accessGrants": existing_grants + new_grants}

	await db['documents'].update_one({"_id": doc_id}, update_ops)
	# Audit best-effort
	try:
		await db['auditlogs'].insert_one({
			"user": requester["_id"],
			"userEmail": requester.get("email"),
			"action": 'DOCUMENT_ACCESS_GRANTED',
			"resource": document.get("name"),
			"details": f"Type: {type_}; Values: {', '.join(values)}",
			"ipAddress": request.headers.get('x-forwarded-for') or request.headers.get('x-real-ip') or 'unknown',
			"userAgent": request.headers.get('user-agent'),
			"severity": 'info',
			"category": 'document',
			"timestamp": request.state.now if hasattr(request.state, 'now') else None
		})
	except Exception:
		pass
	return {"success": True} 