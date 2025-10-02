"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, MessageSquare, Search, Shield, Upload, Users, BarChart3, Settings, User as UserIcon, Eye, EyeOff } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { useUser, User } from "./contexts/UserContext"
import TwoFAModal from "./components/TwoFAModal"
import ChangePasswordModal from "./components/ChangePasswordModal"
import { API_ENDPOINTS } from "@/lib/api"


export default function LandingPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showAccessModal, setShowAccessModal] = useState(false)
  const [showTwoFAModal, setShowTwoFAModal] = useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [pendingUser, setPendingUser] = useState<User | null>(null)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotLoading, setForgotLoading] = useState(false)
  const [isForgotFlow, setIsForgotFlow] = useState(false)
  const [forgotUser, setForgotUser] = useState<{ _id: string, email: string, name?: string } | null>(null)
  const [forgotTwoFAToken, setForgotTwoFAToken] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState<string | undefined>(undefined)
  const [blockRedirect, setBlockRedirect] = useState(false)
  const [modalDismissed, setModalDismissed] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const { user, setUser, isLoading } = useUser() as {
    user: User | null;
    setUser: (user: User | null, dashboard?: 'admin' | 'user') => void;
    isLoading: boolean;
  }

  const handleAccessSelection = (accessType: 'admin' | 'user') => {
    if (!user) return

    // Check if user has the required permissions
    if (accessType === 'admin') {
      const hasAdminAccess = (user as User).permissions.includes('admin_access') || 
                           (user as User).role === 'Admin' || 
                           (user as User).permissions.includes('manage_users') ||
                           (user as User).permissions.includes('manage_documents')
      
      if (!hasAdminAccess) {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges",
          variant: "warning"
        })
        return
      }
      
      router.replace('/admin')
    } else {
      const hasUserAccess = (user as User).permissions.includes('user_page_access')
      
      if (!hasUserAccess) {
        toast({
          title: "Access Denied",
          description: "You don't have user dashboard access",
          variant: "warning"
        })
        return
      }
      
      router.replace('/chat')
    }
    
    setShowAccessModal(false)
  }

  function handleAccessModalClose() {
    setUser(null); // log out
    localStorage.clear(); // clear all shared preferences
    router.replace("/"); // go to login page
  }

  // Handle first-time login (password reset required)
  const handleFirstTimeLogin = (userData: User) => {
    // Don't set user in context yet - this prevents useEffect from running
    setShowChangePasswordModal(true)
    setIsChangingPassword(true)
    setBlockRedirect(true)
    // Store user data temporarily without setting it in context
    setPendingUser(userData)
    toast({
      title: "Password Reset Required",
      description: "Please change your password to continue.",
      variant: "info"
    })
    console.log("Password reset required - showing ChangePasswordModal")
  }

  // Handle normal login redirect logic
  const handleNormalLoginRedirect = (userData: User) => {
    setUser(userData)
    
    // Check if user has admin access
    const hasAdminAccess = userData.permissions.includes('admin_access') || 
                         userData.role === 'Admin' || 
                         userData.permissions.includes('manage_users') ||
                         userData.permissions.includes('manage_documents')
    
    // Check if user has user page access
    const hasUserAccess = userData.permissions.includes('user_page_access')
    
    if (hasAdminAccess && hasUserAccess) {
      // Show modal for choice between admin and user
      setShowAccessModal(true)
      toast({
        title: "Success",
        description: "Login successful! Choose your access level.",
        variant: "success"
      })
    } else if (hasAdminAccess) {
      // Only admin access, go directly to admin
      router.replace('/admin')
      toast({
        title: "Success",
        description: "Login successful! Redirecting to admin dashboard.",
        variant: "success"
      })
    } else if (hasUserAccess) {
      // Only user access, go directly to user page
      router.replace('/chat')
      toast({
        title: "Success",
        description: "Login successful! Redirecting to user dashboard.",
        variant: "success"
      })
    } else {
      // No access, show error
      toast({
        title: "Access Denied",
        description: "You don't have access to any dashboard. Please contact administrator.",
        variant: "destructive"
      })
    }
  }

  const handleTwoFAVerification = (data?: { token?: string }) => {
    // Forgot-password flow: after 2FA verification, allow password change
    if (isForgotFlow) {
      setResetToken(data?.token || undefined)
      setShowTwoFAModal(false)
      setShowChangePasswordModal(true)
      setIsChangingPassword(true)
      setBlockRedirect(true)
      toast({
        title: "2FA Verified",
        description: "You may now change your password.",
        variant: "success"
      })
      return
    }

    // Normal login flow
    if (!pendingUser) {
      toast({
        title: "Error",
        description: "No user data available for verification.",
        variant: "destructive"
      })
      return
    }
    
    setPendingUser(null)
    setShowTwoFAModal(false)

    // If password reset is required, handle as first-time login
    if (pendingUser.passwordResetRequired) {
      handleFirstTimeLogin(pendingUser)
      return
    }
    
    // Handle as normal login
    handleNormalLoginRedirect(pendingUser)
    toast({
      title: "Success",
      description: "2FA verification successful!",
      variant: "success"
    })
  }

  const handlePasswordChanged = () => {
    if (!pendingUser) {
      toast({
        title: "Error",
        description: "User session not found. Please log in again.",
        variant: "destructive"
      })
      router.replace('/')
      return
    }

    // Show success message
    toast({
      title: "Success",
      description: "Password changed successfully!",
      variant: "success"
    })

    // Update user data to clear passwordResetRequired
    const updatedUser = { ...pendingUser, passwordResetRequired: false }

    // Update user context with updated user to clear passwordResetRequired globally
    setUser(updatedUser)

    // Close the modal and mark password changing as complete
    setShowChangePasswordModal(false)
    setIsChangingPassword(false)
    setBlockRedirect(false)
    setPendingUser(null)
    
    // Now set the user in context and handle redirect
    handleNormalLoginRedirect(updatedUser)
  }

  const handlePasswordModalClose = () => {
    setShowChangePasswordModal(false)
    setIsChangingPassword(false)
    setBlockRedirect(false)

    // If user cancelled password change, check if they had passwordResetRequired
    if (pendingUser && pendingUser.passwordResetRequired) {
     
      setPendingUser(null)
      localStorage.clear()
      router.replace('/')
    }
    // If this was a forgot-password flow, reset state
    if (isForgotFlow) {
      setIsForgotFlow(false)
      setForgotUser(null)
      setForgotTwoFAToken(null)
    }
  }

  const handleForgotPasswordChanged = () => {
    // Password changed during forgot-password flow
    toast({
      title: "Password Changed",
      description: "Your password has been updated. Please sign in with your new password.",
      variant: "success"
    })
    setShowChangePasswordModal(false)
    setIsChangingPassword(false)
    setBlockRedirect(false)
    setIsForgotFlow(false)
    setForgotUser(null)
    setForgotTwoFAToken(null)
    setShowForgotModal(false)
  }

  // Handle redirects in useEffect instead of render
  useEffect(() => {
    // Don't run any redirect logic if user is changing password
    if (isChangingPassword || showChangePasswordModal) {
      return
    }

    if (user && !isLoading) {
      // Prevent redirect if password reset modal is active or redirect is blocked
      if ((user as User).passwordResetRequired || blockRedirect) {
        return
      }

      // Don't redirect if the access modal is currently shown or dismissed
      if (showAccessModal || modalDismissed) {
        return
      }

      // Check permissions
      const hasAdminAccess = (user as User).permissions.includes('admin_access') ||
                           (user as User).role === 'Admin' ||
                           (user as User).permissions.includes('manage_users') ||
                           (user as User).permissions.includes('manage_documents')

      const hasUserAccess = (user as User).permissions.includes('user_page_access')

      // Only auto-redirect if user has access to only one dashboard
      if (hasAdminAccess && !hasUserAccess) {
        router.replace('/admin')
      } else if (hasUserAccess && !hasAdminAccess) {
        router.replace('/chat')
      } else if (hasAdminAccess && hasUserAccess) {
        // If user has both permissions, show the modal to let them choose
        // Only set modal if it is not already shown and not dismissed
        if (!showAccessModal && !modalDismissed) {
          setShowAccessModal(true)
        }
      } else if ((user as User).role === 'Admin') {
        // Fallback for Admin role users who might not have specific permissions
        router.replace('/admin')
      }
    }
  }, [user, isLoading, router, blockRedirect, showAccessModal, modalDismissed, showChangePasswordModal, isChangingPassword])

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

  // Don't show login form if already authenticated, but still render the modal
  if (user) {
    // Check permissions for the modal
    const hasAdminAccess = (user as User).permissions.includes('admin_access') ||
                         (user as User).role === 'Admin' ||
                         (user as User).permissions.includes('manage_users') ||
                         (user as User).permissions.includes('manage_documents')

    const hasUserAccess = (user as User).permissions.includes('user_page_access')

    return (
      <>
        {/* Access Selection Modal */}
        <Dialog open={showAccessModal} onOpenChange={(open) => {
          setShowAccessModal(open);
          if (!open) {
            setModalDismissed(true)
            handleAccessModalClose();
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="text-center">
              <DialogTitle className="text-xl font-semibold">Welcome Back!</DialogTitle>
              <DialogDescription className="text-base">
                Hi <span className="font-medium text-gray-900">{(user as any)?.name}</span>, where would you like to go today?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              {hasUserAccess && (
                <Button
                  onClick={() => handleAccessSelection('user')}
                  className="w-full h-20 flex items-center justify-start space-x-4 p-4 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 transition-all duration-200"
                  variant="outline"
                >
                  <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg">
                    <UserIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">User Dashboard</div>
                    <div className="text-sm text-gray-500">Chat with AI and manage documents</div>
                  </div>
                </Button>
              )}

              {hasAdminAccess && (
                <Button
                  onClick={() => handleAccessSelection('admin')}
                  className="w-full h-20 flex items-center justify-start space-x-4 p-4 hover:bg-purple-50 border-2 border-gray-200 hover:border-purple-300 transition-all duration-200"
                  variant="outline"
                >
                  <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg">
                    <Settings className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">Admin Dashboard</div>
                    <div className="text-sm text-gray-500">Manage users, documents, and system</div>
                  </div>
                </Button>
              )}
            </div>
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAccessModal(false);
                  handleAccessModalClose();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 2FA Verification Modal */}
        <TwoFAModal
          open={showTwoFAModal}
          onClose={() => setShowTwoFAModal(false)}
          onVerify={handleTwoFAVerification}
        />

        {/* Change Password Modal */}
        <ChangePasswordModal
          isOpen={showChangePasswordModal}
          onClose={handlePasswordModalClose}
          onPasswordChanged={handlePasswordChanged}
          userId={pendingUser?._id || (user as User | null)?._id || ''}
          email={pendingUser?.email || (user as User | null)?.email || ''}
        />
      </>
    )
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
          if (!email.trim() || !password.trim()) {
        toast({
          title: "Missing Information",
          description: "Please enter both email and password",
          variant: "warning"
        })
        return
      }

    try {
      setLoading(true)
      const response = await fetch(API_ENDPOINTS.auth.login, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Extract the specific error message from the API response
        const errorMessage = data.error || 'Login failed'
        throw new Error(errorMessage)
      }

      // Store token in localStorage
      localStorage.setItem('authToken', data.token)
      
      // Check if user has 2FA configured and needs verification
      if (data.user.twoFASecret && data.user.status === 'verifying') {
        // Show 2FA modal for verification
        setPendingUser(data.user)
        setShowTwoFAModal(true)
        toast({
          title: "2FA Required",
          description: "Please enter your 2FA code to complete login.",
          variant: "info"
        })
      } else {
        // If password reset is required, handle as first-time login
        if (data.user.passwordResetRequired) {
          handleFirstTimeLogin(data.user)
          return
        }

        // Handle as normal login
        handleNormalLoginRedirect(data.user)
      }

    } catch (error) {
      console.error('Login error:', error)
      
      // Handle different types of errors
      let errorTitle = "Login Failed"
      let errorMessage = "An unexpected error occurred. Please try again."
      let errorVariant: "destructive" | "warning" | "info" = "destructive"
      
      if (error instanceof Error) {
        const errorText = error.message.toLowerCase()
        
        if (errorText.includes('invalid email or password') || errorText.includes('invalid credentials')) {
          errorTitle = "Invalid Credentials"
          errorMessage = "The email or password you entered is incorrect. Please check your credentials and try again."
          errorVariant = "destructive"
        } else if (errorText.includes('account is suspended')) {
          errorTitle = "Account Suspended"
          errorMessage = "Your account has been suspended. Please contact your administrator for assistance."
          errorVariant = "warning"
        } else if (errorText.includes('email and password are required')) {
          errorTitle = "Missing Information"
          errorMessage = "Please enter both your email and password."
          errorVariant = "warning"
        } else if (errorText.includes('network') || errorText.includes('fetch')) {
          errorTitle = "Connection Error"
          errorMessage = "Unable to connect to the server. Please check your internet connection and try again."
          errorVariant = "info"
        } else {
          errorMessage = error.message
          errorVariant = "destructive"
        }
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: errorVariant
      })
    } finally {
      setLoading(false)
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  const handleForgotPasswordInitiate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "warning"
      })
      return
    }
    try {
      setForgotLoading(true)
      const res = await fetch(API_ENDPOINTS.auth.forgotPasswordInitiate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate password reset')
      }

      setForgotUser({ _id: data.user._id, email: data.user.email, name: data.user.name })
      setIsForgotFlow(true)
      setShowForgotModal(false)

      if (data.twoFAEnabled) {
        setForgotTwoFAToken(data.token)
        setShowTwoFAModal(true)
        toast({
          title: "2FA Required",
          description: "Enter your 2FA code to continue.",
          variant: "info"
        })
      } else {
        // No 2FA; allow direct password change
        setShowChangePasswordModal(true)
        setIsChangingPassword(true)
        setBlockRedirect(true)
        toast({
          title: "Proceed",
          description: "You may now change your password.",
          variant: "info"
        })
      }
    } catch (err) {
      console.error('Forgot password initiate error:', err)
      toast({
        title: "Request Failed",
        description: err instanceof Error ? err.message : 'Unable to process request',
        variant: "destructive"
      })
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="mt-[-100px] w-[320px] space-y-8">
        <div className="text-center space-y-1">
          <img src="/logo/OXY_gray.png" alt="OXY Logo" className="h-14 w-14 mx-auto" />
          <p className="text-xl text-gray-600 font-bold leading-relaxed">Oxy</p>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full"
              />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  onClick={togglePasswordVisibility}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
          </div>
          <div>
              <Button 
                type="submit" 
                variant="dark" 
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing In..." : "Sign In"}
              </Button>
          </div>
          <div className="space-y-2">
          </div>
                      <div className="text-center">
            <button type="button" onClick={() => setShowForgotModal(true)} className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
              Forgot your password?
            </button>

          </div>
          </form>
        </div>
      </div>

      {/* 2FA Verification Modal */}
      <TwoFAModal
        open={showTwoFAModal}
        onClose={() => setShowTwoFAModal(false)}
        onVerify={handleTwoFAVerification}
        forgotToken={isForgotFlow ? (forgotTwoFAToken || undefined) : undefined}
      />

      {/* Change Password Modal */}
        {(user || pendingUser || forgotUser) && (
        <ChangePasswordModal
          isOpen={showChangePasswordModal}
          onClose={handlePasswordModalClose}
          onPasswordChanged={isForgotFlow ? handleForgotPasswordChanged : handlePasswordChanged}
          userId={forgotUser?._id || pendingUser?._id || (user as User | null)?._id || ''}
          email={forgotUser?.email || pendingUser?.email || (user as User | null)?.email || ''}
          resetToken={resetToken}
        />
      )}

      {/* Forgot Password Modal */}
      <Dialog open={showForgotModal} onOpenChange={setShowForgotModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forgot Password</DialogTitle>
            <DialogDescription>
              Enter your account email. If 2FA is enabled, you will need to verify before changing your password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPasswordInitiate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgotEmail">Email</Label>
              <Input
                id="forgotEmail"
                type="email"
                placeholder="name@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                disabled={forgotLoading}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForgotModal(false)} disabled={forgotLoading}>Cancel</Button>
              <Button type="submit" disabled={forgotLoading || !forgotEmail.trim()}>
                {forgotLoading ? 'Processing...' : 'Continue'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
