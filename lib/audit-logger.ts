interface AuditLogData {
  user: string
  userEmail: string
  action: string
  resource: string
  details?: string
  ipAddress?: string
  userAgent?: string
  severity?: 'info' | 'warning' | 'error'
  category: 'authentication' | 'document' | 'user_management' | 'role_management' | 'ai_query' | 'security' | 'system'
}

export async function logAuditEvent(data: AuditLogData) {
  try {
    const response = await fetch('/api/audit-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      console.error('Failed to log audit event:', data)
    }

    return response.ok
  } catch (error) {
    console.error('Error logging audit event:', error)
    return false
  }
}

// Predefined audit log functions for common actions
export const auditLogger = {
  // Authentication events
  userLogin: (user: string, userEmail: string, ipAddress?: string, userAgent?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'USER_LOGIN',
      resource: 'System Login',
      details: 'User logged in successfully',
      ipAddress,
      userAgent,
      severity: 'info',
      category: 'authentication'
    })
  },

  loginFailed: (user: string, userEmail: string, ipAddress?: string, userAgent?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'LOGIN_FAILED',
      resource: 'Failed Login Attempt',
      details: `Failed login attempt for user: ${userEmail}`,
      ipAddress,
      userAgent,
      severity: 'error',
      category: 'security'
    })
  },

  userLogout: (user: string, userEmail: string, ipAddress?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'USER_LOGOUT',
      resource: 'System Logout',
      details: 'User logged out',
      ipAddress,
      severity: 'info',
      category: 'authentication'
    })
  },

  // Document events
  documentUpload: (user: string, userEmail: string, fileName: string, fileSize?: string, pages?: number, ipAddress?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'DOCUMENT_UPLOAD',
      resource: fileName,
      details: `Document uploaded successfully. File size: ${fileSize}, Pages: ${pages}`,
      ipAddress,
      severity: 'info',
      category: 'document'
    })
  },

  documentDelete: (user: string, userEmail: string, fileName: string, ipAddress?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'DOCUMENT_DELETE',
      resource: fileName,
      details: 'Document deleted permanently',
      ipAddress,
      severity: 'warning',
      category: 'document'
    })
  },

  documentQuery: (user: string, userEmail: string, query: string, documentsSearched: number, ipAddress?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'DOCUMENT_QUERY',
      resource: 'AI Query',
      details: `Query: '${query}' - Documents searched: ${documentsSearched}`,
      ipAddress,
      severity: 'info',
      category: 'ai_query'
    })
  },

  // User management events
  userCreated: (adminUser: string, adminEmail: string, newUser: string, newUserEmail: string, role: string, ipAddress?: string) => {
    return logAuditEvent({
      user: adminUser,
      userEmail: adminEmail,
      action: 'USER_CREATED',
      resource: `New User: ${newUserEmail}`,
      details: `New user account created with role: ${role}`,
      ipAddress,
      severity: 'info',
      category: 'user_management'
    })
  },

  userUpdated: (adminUser: string, adminEmail: string, targetUser: string, targetEmail: string, changes: string, ipAddress?: string) => {
    return logAuditEvent({
      user: adminUser,
      userEmail: adminEmail,
      action: 'USER_UPDATED',
      resource: `User: ${targetEmail}`,
      details: `User account updated: ${changes}`,
      ipAddress,
      severity: 'info',
      category: 'user_management'
    })
  },

  userSuspended: (adminUser: string, adminEmail: string, targetUser: string, targetEmail: string, ipAddress?: string) => {
    return logAuditEvent({
      user: adminUser,
      userEmail: adminEmail,
      action: 'USER_SUSPENDED',
      resource: `User: ${targetEmail}`,
      details: 'User account suspended',
      ipAddress,
      severity: 'warning',
      category: 'user_management'
    })
  },

  // Role management events
  roleCreated: (adminUser: string, adminEmail: string, roleName: string, permissions: string[], ipAddress?: string) => {
    return logAuditEvent({
      user: adminUser,
      userEmail: adminEmail,
      action: 'ROLE_CREATED',
      resource: `Role: ${roleName}`,
      details: `New role created with permissions: ${permissions.join(', ')}`,
      ipAddress,
      severity: 'info',
      category: 'role_management'
    })
  },

  roleUpdated: (adminUser: string, adminEmail: string, roleName: string, changes: string, ipAddress?: string) => {
    return logAuditEvent({
      user: adminUser,
      userEmail: adminEmail,
      action: 'ROLE_UPDATED',
      resource: `Role: ${roleName}`,
      details: `Role permissions updated: ${changes}`,
      ipAddress,
      severity: 'info',
      category: 'role_management'
    })
  },

  // System events
  systemBackup: (user: string, userEmail: string, details: string, ipAddress?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'SYSTEM_BACKUP',
      resource: 'Database Backup',
      details,
      ipAddress,
      severity: 'info',
      category: 'system'
    })
  },

  systemError: (user: string, userEmail: string, error: string, ipAddress?: string) => {
    return logAuditEvent({
      user,
      userEmail,
      action: 'SYSTEM_ERROR',
      resource: 'System Error',
      details: error,
      ipAddress,
      severity: 'error',
      category: 'system'
    })
  }
} 