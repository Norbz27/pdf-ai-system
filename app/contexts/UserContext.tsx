"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

export interface User {
  _id: string
  name: string
  email: string
  role: string
  permissions: string[]
  status: string
  avatar?: string
  passwordResetRequired?: boolean
}

interface UserContextType {
  user: User | null
  setUser: (user: User | null, dashboard?: 'admin' | 'user') => void
  logout: () => void
  isLoading: boolean
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [justLoggedOut, setJustLoggedOut] = useState(false)
  const router = useRouter()

  // Helper to set user and cache in localStorage
  const setUser = (user: User | null, dashboard?: 'admin' | 'user') => {
    setUserState(user)
    if (user) {
      localStorage.setItem('userData', JSON.stringify(user))
      // Set lastDashboard if provided (dashboard switch), or infer from user permissions
      if (dashboard) {
        localStorage.setItem('lastDashboard', dashboard)
      } else if (user.permissions?.includes('admin_access') || user.role === 'Admin' || user.permissions?.includes('manage_users') || user.permissions?.includes('manage_documents')) {
        localStorage.setItem('lastDashboard', 'admin')
      } else if (user.permissions?.includes('user_page_access')) {
        localStorage.setItem('lastDashboard', 'user')
      }
      setJustLoggedOut(false) // Reset justLoggedOut on login or dashboard switch
    } else {
      localStorage.removeItem('userData')
      localStorage.removeItem('lastDashboard')
      localStorage.removeItem('tempDashboardToken') // Clear tempDashboardToken
      setJustLoggedOut(true) // Set justLoggedOut to true on logout or invalid token
      setUserState(null) // Ensure user state is null
    }
  }

  useEffect(() => {
    // Check if user is logged in on app start
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('authToken')
        const cachedUser = localStorage.getItem('userData')
        if (token) {
          // Try to verify token with backend
          try {
            const response = await fetch('/api/auth/verify', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })
            if (response.ok) {
              const userData = await response.json()
              setUser(userData.user) // lastDashboard will be set automatically
              setJustLoggedOut(false) // Only reset justLoggedOut on successful login
            } else if (response.status === 401 || response.status === 403) {
              // Token is invalid, clear it
              localStorage.removeItem('authToken')
              setUser(null)
            } else {
              // Network/server error, fallback to cached user if available
              let parsedUser = null
              const token = localStorage.getItem('authToken')
              if (cachedUser) {
                try {
                  parsedUser = JSON.parse(cachedUser)
                } catch (e) {
                  parsedUser = null
                }
              }
              // Only restore cached user if token exists
              if (parsedUser && parsedUser._id && token) {
                setUser(parsedUser)
                // Do NOT reset justLoggedOut here if cached user exists
              } else {
                setUser(null)
                setJustLoggedOut(true)
              }
            }
          } catch (error) {
            // Network error, fallback to cached user if available
            let parsedUser = null
            const token = localStorage.getItem('authToken')
            if (cachedUser) {
              try {
                parsedUser = JSON.parse(cachedUser)
              } catch (e) {
                parsedUser = null
              }
            }
            // Only restore cached user if token exists
            if (parsedUser && parsedUser._id && token) {
              setUser(parsedUser)
              // Do NOT reset justLoggedOut here if cached user exists
            } else {
              setUser(null)
              setJustLoggedOut(true)
            }
          }
        } else {
          setUser(null)
          setJustLoggedOut(true) // Block redirect if no token
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        localStorage.removeItem('authToken')
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    checkAuthStatus()
  }, [])

  // Redirect to last dashboard if authenticated and not already on that dashboard
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    const lastDashboard = localStorage.getItem('lastDashboard')
    const currentPath = window.location.pathname
    const hasAdminAccess = user?.permissions?.includes('admin_access') ||
                         user?.role === 'Admin' ||
                         user?.permissions?.includes('manage_users') ||
                         user?.permissions?.includes('manage_documents')
    const hasUserAccess = user?.permissions?.includes('user_page_access')
    // Only redirect if user is active, not just logged out, and not on logout
    if (
      !isLoading &&
      user &&
      user.status === 'active' &&
      token &&
      !justLoggedOut
    ) {
      // If user has both, do NOT redirect, let modal show
      if (hasAdminAccess && hasUserAccess) {
        // Do not redirect, modal should handle selection
        return
      }
      // If user has only one dashboard, redirect automatically
      if (lastDashboard && currentPath === '/') {
        router.replace(lastDashboard === 'admin' ? '/admin' : '/chat')
      }
    }
    // If just logged out, do NOT redirect, let user choose
  }, [isLoading, user, router, justLoggedOut])

  const logout = () => {
    setUserState(null)
    localStorage.removeItem('authToken')
    localStorage.removeItem('lastDashboard')
    localStorage.removeItem('userData')
    localStorage.removeItem('tempDashboardToken') // Clear tempDashboardToken
    setJustLoggedOut(true)
    router.replace('/')
  }

  return (
    <UserContext.Provider value={{ user, setUser, logout, isLoading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}