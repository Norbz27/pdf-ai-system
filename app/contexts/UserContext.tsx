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
}

interface UserContextType {
  user: User | null
  setUser: (user: User | null) => void
  logout: () => void
  isLoading: boolean
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check if user is logged in on app start
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('authToken')
        
        if (token) {
          // Verify token with backend
          try {
            const response = await fetch('/api/auth/verify', {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })
            
            if (response.ok) {
              const userData = await response.json()
              setUser(userData.user)
            } else {
              // Token is invalid, clear it
              localStorage.removeItem('authToken')
              setUser(null)
            }
          } catch (error) {
            console.error('Token verification error:', error)
            // Don't clear token on network errors, just set user to null
            setUser(null)
          }
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

  const logout = () => {
    setUser(null)
    localStorage.removeItem('authToken')
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