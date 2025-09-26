from fastapi import APIRouter, Request, HTTPException, Depends
from typing import Any, Dict
from bson import ObjectId
from datetime import datetime
from ..db.mongo import get_db
from ..auth.deps import require_admin
from ..services import audit as audit_service

router = APIRouter()

@router.get("/admin/documents")
async def admin_list_documents(req: Request, admin = Depends(require_admin)):
	db = get_db()
	params = dict(req.query_params)
	category = params.get('category')
	status = params.get('status')
	search = params.get('search')
	# Build filter
	filter_obj: Dict[str, Any] = {}
	if category and category != 'all':
		filter_obj['category'] = category  # Note: original admin route used 'category' as a string; we mirror it
	if status and status != 'all':
		filter_obj['status'] = status
	if search:
		filter_obj['$or'] = [
			{ 'name': { '$regex': search, '$options': 'i' } },
			{ 'uploadedBy': { '$regex': search, '$options': 'i' } }
		]
	pipeline = [
		{ '$match': filter_obj },
		{ '$lookup': { 'from': 'categories', 'localField': 'categoryId', 'foreignField': '_id', 'as': 'categoryInfo' } },
		{ '$lookup': { 'from': 'users', 'localField': 'uploadedBy', 'foreignField': '_id', 'as': 'userInfo' } },
		{ '$addFields': {
			'category': { '$arrayElemAt': [ '$categoryInfo.name', 0 ] },
			'uploadedBy': { '$arrayElemAt': [ '$userInfo.name', 0 ] }
		}},
		{ '$project': { 'categoryInfo': 0, 'userInfo': 0 } },
		{ '$sort': { 'createdAt': -1 } },
	]
	cursor = db['documents'].aggregate(pipeline)
	documents = [doc async for doc in cursor]
	for d in documents:
		if isinstance(d.get('_id'), ObjectId):
			d['_id'] = str(d['_id'])
	return { 'documents': documents }

@router.post("/admin/documents")
async def admin_create_document(body: Dict[str, Any], req: Request, admin = Depends(require_admin)):
	db = get_db()
	name = body.get('name')
	category_id = body.get('categoryId')
	uploaded_by = body.get('uploadedBy')
	size = body.get('size') or '0 MB'
	pages = body.get('pages') or 0
	status = body.get('status') or 'processing'
	if not name or not category_id or not uploaded_by:
		raise HTTPException(status_code=400, detail={ 'error': 'Missing required fields: name, categoryId, uploadedBy' })
	existing = await db['documents'].find_one({ 'name': name })
	if existing:
		raise HTTPException(status_code=409, detail={ 'error': 'Document with this name already exists' })
	new_doc = {
		'name': name,
		'categoryId': category_id,
		'uploadedBy': uploaded_by,
		'size': size,
		'pages': pages,
		'status': status,
		'filePath': '',
		'createdAt': datetime.utcnow().isoformat(),
		'updatedAt': datetime.utcnow().isoformat(),
	}
	res = await db['documents'].insert_one(new_doc)
	ip = req.headers.get('x-forwarded-for') or req.headers.get('x-real-ip') or 'unknown'
	await audit_service.document_upload(db, 'Admin', 'admin@example.com', name, size, pages, ip)
	return { 'success': True, 'documentId': str(res.inserted_id), 'document': { **new_doc, '_id': str(res.inserted_id) } }

@router.put("/admin/documents/{id}")
async def admin_update_document(id: str, body: Dict[str, Any], req: Request, admin = Depends(require_admin)):
	db = get_db()
	name = body.get('name')
	category_id = body.get('categoryId')
	status_val = body.get('status')
	if not name or not category_id:
		raise HTTPException(status_code=400, detail={ 'error': 'Missing required fields: name, categoryId' })
	existing = await db['documents'].find_one({ 'name': name, '_id': { '$ne': ObjectId(id) } })
	if existing:
		raise HTTPException(status_code=409, detail={ 'error': 'Document with this name already exists' })
	update_data: Dict[str, Any] = { 'name': name, 'categoryId': category_id, 'updatedAt': datetime.utcnow().isoformat() }
	if status_val:
		update_data['status'] = status_val
	res = await db['documents'].update_one({ '_id': ObjectId(id) }, { '$set': update_data })
	if res.matched_count == 0:
		raise HTTPException(status_code=404, detail={ 'error': 'Document not found' })
	return { 'success': True, 'message': 'Document updated successfully' }

@router.patch("/admin/documents/{id}")
async def admin_patch_document(id: str, body: Dict[str, Any], req: Request, admin = Depends(require_admin)):
	# Reuse the same behavior as non-admin PATCH in documents; for parity, we accept status/reprocess
	db = get_db()
	status = body.get('status')
	reprocess = body.get('reprocess')
	if not status or status not in ['processed', 'processing', 'error']:
		raise HTTPException(status_code=400, detail={ 'error': "Invalid status. Must be 'processed', 'processing', or 'error'" })
	if reprocess:
		document = await db['documents'].find_one({ '_id': ObjectId(id) })
		if not document:
			raise HTTPException(status_code=404, detail={ 'error': 'Document not found' })
		file_path = document.get('filePath')
		if not file_path:
			raise HTTPException(status_code=400, detail={ 'error': 'Document file path not found' })
		# For now, we delegate to user-facing reprocess flow by updating status; Phase 2 will plug RAG reprocess
		await db['documents'].update_one({ '_id': ObjectId(id) }, { '$set': { 'status': 'processed', 'updatedAt': datetime.utcnow().isoformat() } })
		return { 'success': True, 'message': 'Document reprocessed successfully' }
	else:
		await db['documents'].update_one({ '_id': ObjectId(id) }, { '$set': { 'status': status, 'updatedAt': datetime.utcnow().isoformat() } })
		return { 'success': True, 'message': f'Document status updated to {status}' }

@router.delete("/admin/documents/{id}")
async def admin_delete_document(id: str, req: Request, admin = Depends(require_admin)):
	db = get_db()
	document = await db['documents'].find_one({ '_id': ObjectId(id) })
	if not document:
		raise HTTPException(status_code=404, detail={ 'error': 'Document not found' })
	res = await db['documents'].delete_one({ '_id': ObjectId(id) })
	if res.deleted_count == 0:
		raise HTTPException(status_code=404, detail={ 'error': 'Document not found' })
	ip = req.headers.get('x-forwarded-for') or req.headers.get('x-real-ip') or 'unknown'
	await audit_service.document_delete(db, 'Admin', 'admin@example.com', document.get('name', ''), ip)
	return { 'success': True, 'message': 'Document deleted successfully' } 