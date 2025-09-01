"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [showSetup2FA, setShowSetup2FA] = useState(false)
  const [isReEnabling, setIsReEnabling] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      loadCurrentSettings()
    }
  }, [isOpen])

  const loadCurrentSettings = async () => {
    try {
      const token = localStorage.getItem('authToken')
      const response = await fetch('/api/users/settings', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setTwoFactorEnabled(data.twoFAEnabled || false)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const handle2FAToggle = async (enabled: boolean) => {
    setError("")

    if (enabled) {
      // Check if user previously had 2FA enabled (re-enabling)
      const token = localStorage.getItem('authToken')
      const settingsResponse = await fetch('/api/users/settings', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const settingsData = await settingsResponse.json()

      setIsReEnabling(settingsData.twoFASecret ? true : false)

      // Enable 2FA - show setup
      setIsLoading(true)
      try {
        const response = await fetch('/api/users/settings', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            twoFAEnabled: true,
          })
        })

        const data = await response.json()

        if (response.ok) {
          setQrCodeUrl(data.qrCodeUrl)
          setShowSetup2FA(true)
          setTwoFactorEnabled(false) // Keep as false until verified
        } else {
          throw new Error(data.error || 'Failed to enable 2FA')
        }
      } catch (error) {
        console.error('Error enabling 2FA:', error)
        setError(error instanceof Error ? error.message : "Failed to enable 2FA")
        setTwoFactorEnabled(false)
      } finally {
        setIsLoading(false)
      }
    } else {
      // Disable 2FA
      setIsLoading(true)
      try {
        const token = localStorage.getItem('authToken')
        const response = await fetch('/api/users/settings', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            twoFAEnabled: false,
          })
        })

        const data = await response.json()

        if (response.ok) {
          setTwoFactorEnabled(false)
          setShowSetup2FA(false)
          setQrCodeUrl("")
          setVerificationCode("")
          setIsReEnabling(false)
          toast({
            title: "2FA disabled",
            description: "Two-factor authentication has been disabled.",
          })
        } else {
          throw new Error(data.error || 'Failed to disable 2FA')
        }
      } catch (error) {
        console.error('Error disabling 2FA:', error)
        setError(error instanceof Error ? error.message : "Failed to disable 2FA")
        setTwoFactorEnabled(true)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleVerify2FA = async () => {
    if (!verificationCode.trim()) {
      setError("Please enter the verification code")
      return
    }

    setIsLoading(true)
    setError("") // Clear any previous errors
    try {
      const token = localStorage.getItem('authToken')
      const response = await fetch('/api/users/verify-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: verificationCode.trim(),
        })
      })

      const data = await response.json()

      if (response.ok) {
        setShowSetup2FA(false)
        setQrCodeUrl("")
        setVerificationCode("")
        setTwoFactorEnabled(true) // Set toggle to true after successful verification
        setIsReEnabling(false)
        toast({
          title: "2FA enabled",
          description: "Two-factor authentication has been successfully enabled.",
        })
      } else {
        throw new Error(data.error || 'Invalid verification code')
      }
    } catch (error) {
      console.error('Error verifying 2FA:', error)
      setError(error instanceof Error ? error.message : "Invalid verification code")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerificationCodeChange = (value: string) => {
    setVerificationCode(value)
    // Clear error when user starts typing a new code
    if (error && value !== verificationCode) {
      setError("")
    }
  }

  const handleCancelSetup = () => {
    setShowSetup2FA(false)
    setQrCodeUrl("")
    setVerificationCode("")
    setError("")
    setTwoFactorEnabled(false) // Reset toggle if setup is cancelled
    setIsReEnabling(false)
  }

  const handleClose = () => {
    setError("")
    setShowSetup2FA(false)
    setQrCodeUrl("")
    setVerificationCode("")
    setIsReEnabling(false)
    onClose()
  }

  if (showSetup2FA) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isReEnabling ? 'Re-enable Two-Factor Authentication' : 'Set up Two-Factor Authentication'}
            </DialogTitle>
            <DialogDescription>
              {isReEnabling
                ? 'Enter the verification code from your authenticator app to re-enable 2FA.'
                : 'Scan the QR code with your authenticator app and enter the verification code.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {qrCodeUrl && !isReEnabling && (
              <div className="flex justify-center">
                <img src={qrCodeUrl} alt="2FA QR Code" className="max-w-full h-auto" />
              </div>
            )}

            {isReEnabling && (
              <Alert>
                <AlertDescription>
                  Using your existing authenticator setup. Enter the current 6-digit code.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="verificationCode">Verification Code</Label>
              <Input
                id="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(e) => handleVerificationCodeChange(e.target.value)}
                placeholder="Enter 6-digit code"
                disabled={isLoading}
                maxLength={6}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelSetup}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerify2FA}
              disabled={!verificationCode.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Enable"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your account settings and preferences.
          </DialogDescription>
        </DialogHeader>

        <form>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="twoFactor">Two-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to your account.
                </p>
              </div>
              <Switch
                id="twoFactor"
                checked={twoFactorEnabled}
                onCheckedChange={handle2FAToggle}
                disabled={isLoading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Close
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
