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


export default function LandingPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showAccessModal, setShowAccessModal] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const { user, setUser, isLoading } = useUser()

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

  // Handle redirects in useEffect instead of render
  useEffect(() => {
    if (user && !isLoading) {
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
        setShowAccessModal(true)
      } else if ((user as User).role === 'Admin') {
        // Fallback for Admin role users who might not have specific permissions
        router.replace('/admin')
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
      const response = await fetch('/api/auth/login', {
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
      setUser(data.user)
      
      // Check if user has admin access
      const hasAdminAccess = data.user.permissions.includes('admin_access') || 
                           data.user.role === 'Admin' || 
                           data.user.permissions.includes('manage_users') ||
                           data.user.permissions.includes('manage_documents')
      
      // Check if user has user page access
      const hasUserAccess = data.user.permissions.includes('user_page_access')
      
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

  function handleAccessModalClose() {
    setUser(null); // log out
    localStorage.clear(); // clear all shared preferences
    router.replace("/"); // go to login page
  }

  return (
    <div className="min-h-screen from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="mt-[-100px] w-[320px] space-y-8">
        <div className="text-center space-y-2">
          <FileText className="h-8 w-8 mx-auto text-dark-200" />
          <p className="text-xl text-gray-600 font-bold leading-relaxed">DocuMind AI</p>
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
                      <div className="text-center">
            <a href="#" className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
              Forgot your password?
            </a>

          </div>
          </form>
        </div>
      </div>

      
    </div>
  )
}
