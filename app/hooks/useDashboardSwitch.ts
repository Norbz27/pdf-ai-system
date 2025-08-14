"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/app/contexts/UserContext'

interface UseDashboardSwitchProps {
  onSuccess?: () => void
  onError?: (error: string) => void
}

export function useDashboardSwitch({ onSuccess, onError }: UseDashboardSwitchProps = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { user, setUser } = useUser()

  const switchDashboard = async (password: string, targetDashboard: 'admin' | 'user') => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          password,
          targetDashboard
        })
      })

      const result = await response.json()

      if (result.success) {
        // Store temporary token
        localStorage.setItem('tempDashboardToken', result.tempToken)
        
        // Update user context
        setUser(result.user)
        
        // Redirect to target dashboard
        router.push(targetDashboard === 'admin' ? '/admin' : '/chat')
        
        return true
      } else {
        throw new Error(result.error || 'Failed to verify password')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  return {
    switchDashboard,
    isLoading,
    error
  }
}
