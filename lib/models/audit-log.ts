export interface AuditLog {
  _id?: string;
  timestamp: string;
  user: string;
  userEmail: string;
  action: string;
  resource: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  severity: 'info' | 'warning' | 'error';
  category: 'authentication' | 'document' | 'user_management' | 'role_management' | 'ai_query' | 'security' | 'system';
  createdAt?: Date;
}

export interface AuditLogFilter {
  category?: string;
  severity?: string;
  dateRange?: string;
  search?: string;
}

export interface AuditLogPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  pagination: AuditLogPagination;
}
