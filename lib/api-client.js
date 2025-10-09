const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
let DEFAULT_TOKEN = null;
export function setToken(newToken) { DEFAULT_TOKEN = newToken || null }

function buildUrl(path, params) {
	const url = new URL(path, BASE_URL)
	if (params && typeof params === 'object') {
		Object.entries(params).forEach(([k, v]) => {
			if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
		})
	}
	return url.toString()
}

async function request(path, { method = 'GET', headers = {}, body, token } = {}) { token = token ?? DEFAULT_TOKEN;
	const url = path.startsWith('http') ? path : buildUrl(path)
	const finalHeaders = { ...headers }
	if (!(body instanceof FormData)) finalHeaders['Content-Type'] = 'application/json'
	if (token) finalHeaders['Authorization'] = `Bearer ${token}`
	const res = await fetch(url, {
		method,
		headers: finalHeaders,
		body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
		credentials: 'include',
	})
	if (!res.ok) {
		if (res.status === 401) {
			// Token expired or invalid, logout user
			localStorage.removeItem('authToken')
			localStorage.removeItem('userData')
			localStorage.removeItem('lastDashboard')
			localStorage.removeItem('tempDashboardToken')
			setToken(null) // Clear the default token
			// Redirect to login page
			window.location.href = '/'
			throw new Error('Session expired. Please log in again.')
		}
		let err
		try { err = await res.json() } catch { err = { message: await res.text() } }
		throw new Error(err?.message || err?.error || `HTTP ${res.status}`)
	}
	const ct = res.headers.get('content-type') || ''
	if (ct.includes('application/json')) return res.json()
	return res.text()
}

// Documents
export async function listDocuments({ userId, userRole } = {}) {
	return request('/api/documents', { method: 'GET', headers: {}, body: undefined, token: undefined, params: undefined, })
}

export async function listDocumentsWithFilters({ userId, userRole } = {}) {
	const url = buildUrl('/api/documents', { userId, userRole })
	return request(url)
}

export async function createDocument({ fileName, categoryId, description, size, uploadedBy }) {
	return request('/api/documents', { method: 'POST', body: { fileName, categoryId, description, size, uploadedBy } })
}

export async function deleteDocument(id) {
	return request(`/api/documents/${id}`, { method: 'DELETE' })
}

export async function patchDocument(id, payload) {
	return request(`/api/documents/${id}`, { method: 'PATCH', body: payload })
}

export async function grantDocumentAccess(id, payload, token) {
	return request(`/api/documents/${id}/access`, { method: 'POST', body: payload, token })
}

export async function reprocessDocument(id, token) {
	return request(`/api/documents/${id}/reprocess`, { method: 'POST', token })
}

export async function getDocumentById(documentId, { userId, userRole } = {}) {
  const url = buildUrl(`/api/documents/${documentId}`, { userId, userRole });
  return request(url);
}

export async function uploadDocument({ file, categoryId, description = '', uploadedBy }) {
	const form = new FormData()
	form.append('file', file)
	form.append('categoryId', categoryId)
	form.append('description', description)
	form.append('uploadedBy', uploadedBy)
	return request('/api/documents/upload', { method: 'POST', body: form })
}

// Admin
export async function adminListDocuments({ category, status, search } = {}, token) {
	const url = buildUrl('/api/admin/documents', { category, status, search })
	return request(url, { token })
}

export async function adminCreateDocument(body, token) {
	return request('/api/admin/documents', { method: 'POST', body, token })
}

export async function adminUpdateDocument(id, body, token) {
	return request(`/api/admin/documents/${id}`, { method: 'PUT', body, token })
}

export async function adminPatchDocument(id, body, token) {
	return request(`/api/admin/documents/${id}`, { method: 'PATCH', body, token })
}

export async function adminDeleteDocument(id, token) {
	return request(`/api/admin/documents/${id}`, { method: 'DELETE', token })
}

// Chat
export async function chat(body) {
	return request('/api/chat', { method: 'POST', body })
}

export function chatWsUrl(params = {}) {
	const base = (BASE_URL || '').replace('http://', 'ws://').replace('https://', 'wss://')
	const url = new URL('/api/chat/ws', base)
	Object.entries(params).forEach(([k, v]) => {
		if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
	})
	return url.toString()
}

export async function getCategories(token) {
	return request('/api/categories', { token })
}

export async function getRoles() {
	return request('/api/roles')
}

export async function getUsers() {
	return request('/api/users')
}
export async function checkDocumentName(name, userId) { return request(`/api/documents/check-name?name=${name}&userId=${userId}`) }
