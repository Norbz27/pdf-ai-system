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
      // Use fetch with full URL and fallback to relative if window is not defined (SSR safety)
      const apiUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/api/auth/verify`
        : '/api/auth/verify';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          password,
          targetDashboard
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || `API error: ${response.status}`);
        return false;
      }

      const result = await response.json();

      if (result.success) {
        localStorage.setItem('tempDashboardToken', result.tempToken);
        setUser(result.user);
        router.push(targetDashboard === 'admin' ? '/admin' : '/chat');
        return true;
      } else {
        setError(result.error || 'Failed to verify password');
        return false;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  return {
    switchDashboard,
    isLoading,
    error
  }
}
