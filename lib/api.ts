// API configuration for FastAPI backend
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  // Auth endpoints
  auth: {
    login: `${API_BASE_URL}/api/auth/login`,
    verify: `${API_BASE_URL}/api/auth/verify`,
    changePassword: `${API_BASE_URL}/api/auth/change-password`,
    forgotPasswordInitiate: `${API_BASE_URL}/api/auth/forgot-password/initiate`,
    forgotPasswordVerify2FA: `${API_BASE_URL}/api/auth/forgot-password/verify-2fa`,
    forgotPasswordReset: `${API_BASE_URL}/api/auth/forgot-password/reset`,
    verify2FA: `${API_BASE_URL}/api/auth/verify/2fa`,
  },

  // User endpoints
  users: {
    list: `${API_BASE_URL}/api/users/`,
    create: `${API_BASE_URL}/api/users/`,
    update: (id: string) => `${API_BASE_URL}/api/users/${id}`,
    delete: (id: string) => `${API_BASE_URL}/api/users/${id}`,
    settings: `${API_BASE_URL}/api/users/settings`,
    verify2FA: `${API_BASE_URL}/api/users/verify-2fa`,
  },

  // Document endpoints
  documents: {
    list: `${API_BASE_URL}/api/documents/`,
    upload: `${API_BASE_URL}/api/documents/upload`,
    update: (id: string) => `${API_BASE_URL}/api/documents/${id}`,
    delete: (id: string) => `${API_BASE_URL}/api/documents/${id}`,
    access: (id: string) => `${API_BASE_URL}/api/documents/${id}/access`,
    publicAccess: (id: string) => `${API_BASE_URL}/api/documents/${id}/access/public`,
  },

  // Download endpoint
  download: `${API_BASE_URL}/api/download`,

  // Chat endpoint
  chat: `${API_BASE_URL}/api/chat`,

  // Categories endpoints
  categories: {
    list: `${API_BASE_URL}/api/categories/`,
    create: `${API_BASE_URL}/api/categories/`,
    update: (id: string) => `${API_BASE_URL}/api/categories/${id}`,
    delete: (id: string) => `${API_BASE_URL}/api/categories/${id}`,
  },

  // Roles endpoints
  roles: {
    list: `${API_BASE_URL}/api/roles/`,
    create: `${API_BASE_URL}/api/roles/`,
    update: (id: string) => `${API_BASE_URL}/api/roles/${id}`,
    delete: (id: string) => `${API_BASE_URL}/api/roles/${id}`,
    recalculateUserCount: `${API_BASE_URL}/api/roles/recalculate-user-count`,
  },

  // Admin endpoints
  admin: {
    dashboard: `${API_BASE_URL}/api/admin/dashboard`,
    users: `${API_BASE_URL}/api/admin/users`,
    documents: `${API_BASE_URL}/api/admin/documents`,
    categories: `${API_BASE_URL}/api/admin/categories`,
    roles: `${API_BASE_URL}/api/admin/roles`,
    auditLogs: `${API_BASE_URL}/api/admin/audit-logs`,
  },

  // Audit logs endpoints
  auditLogs: {
    list: `${API_BASE_URL}/api/audit-logs`,
    export: `${API_BASE_URL}/api/audit-logs/export`,
  },

  // Ollama endpoint
  ollama: {
    status: `${API_BASE_URL}/api/ollama/status`,
  },
};

// Helper function to get auth headers
export const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Helper function to make authenticated requests
export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('authToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};
