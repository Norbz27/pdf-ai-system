"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, User } from '../contexts/UserContext'

interface ProtectedLoginProps {
  children: React.ReactNode
}

export default function ProtectedLogin({ children }: ProtectedLoginProps) {
  const { user, isLoading } = useUser()
  const router = useRouter()

  useEffect(() => {
    console.log('ProtectedLogin - isLoading:', isLoading, 'user:', user)
    
    if (!isLoading && user) {
      console.log('User is authenticated, checking permissions')
      // User is authenticated, redirect based on permissions
      const hasAdminAccess = (user as User).permissions.includes('admin_access') || 
                           (user as User).role === 'Admin' || 
                           (user as User).permissions.includes('manage_users') ||
                           (user as User).permissions.includes('manage_documents')
      
      const hasUserAccess = (user as User).permissions.includes('user_page_access')
      
      console.log('Permissions - Admin:', hasAdminAccess, 'User:', hasUserAccess)
      
      if (hasAdminAccess && hasUserAccess) {
        console.log('Both admin and user access, showing modal')
        // Show access selection modal (handled by parent component)
        return
      } else if (hasAdminAccess) {
        console.log('Redirecting to admin')
        router.replace('/admin')
      } else if (hasUserAccess) {
        console.log('Redirecting to chat')
        router.replace('/chat')
      }
    }
  }, [user, isLoading, router])

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2C2C2C] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't show login page if already authenticated
  if (user) {
    return null
  }

  return <>{children}</>
} 