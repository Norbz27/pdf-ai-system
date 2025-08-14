"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '../contexts/UserContext'

interface AuthGuardProps {
  children: React.ReactNode
  requiredPermissions?: string[]
  fallbackPath?: string
}

export default function AuthGuard({ 
  children, 
  requiredPermissions = [], 
  fallbackPath = '/' 
}: AuthGuardProps) {
  const { user, isLoading } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(fallbackPath)
    }
  }, [user, isLoading, router, fallbackPath])

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect if not authenticated
  if (!user) {
    return null
  }

  // Check permissions if required
  if (requiredPermissions.length > 0) {
    const hasPermission = requiredPermissions.some(permission => 
      user.permissions.includes(permission)
    )
    
    if (!hasPermission) {
      router.push(fallbackPath)
      return null
    }
  }

  return <>{children}</>
} 