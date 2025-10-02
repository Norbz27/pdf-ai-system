"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {  User as UserIcon, Eye, EyeOff } from "lucide-react"
import { API_ENDPOINTS } from "@/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Users,
  Plus,
  Search,
  Edit,
  UserX,
  MoreHorizontal,
  Mail,
  Calendar,
  Copy,
  QrCode
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface User {
  _id: string
  name: string
  email: string
  role: string
  roleId: string
  status: 'active' | 'suspended' | 'inactive'
  avatar: string
  lastLogin: string | null
  joinedDate: string
  createdAt: string
  updatedAt: string
}

interface Role {
  _id: string
  name: string
  description: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRole, setSelectedRole] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "User",
    password: ""
  })
  const { toast } = useToast()
  const [generatedPassword, setGeneratedPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [qrCodeData, setQrCodeData] = useState<{url: string, secret: string, email: string} | null>(null)
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false)
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [newGeneratedPassword, setNewGeneratedPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Password generator function
  function generatePassword(length = 12) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-="
    let password = ""
    for (let i = 0; i < length; ++i) {
      const randomIndex = Math.floor(Math.random() * charset.length)
      password += charset[randomIndex]
    }
    return password
  }

  // Generate password when dialog opens
  useEffect(() => {
    if (isInviteDialogOpen) {
      const pwd = generatePassword()
      setGeneratedPassword(pwd)
      setNewUser((prev) => ({ ...prev, password: pwd }))
      setShowPassword(true)
    }
  }, [isInviteDialogOpen])

  // Generate new password for reset when dialog opens
  useEffect(() => {
    if (isResetPasswordDialogOpen && resetPasswordUser) {
      const pwd = generatePassword()
      setNewGeneratedPassword(pwd)
      setShowNewPassword(true)
    }
  }, [isResetPasswordDialogOpen, resetPasswordUser])

  // Regenerate password
  const handleRegeneratePassword = () => {
    const pwd = generatePassword()
    setGeneratedPassword(pwd)
    setNewUser((prev) => ({ ...prev, password: pwd }))
    setShowPassword(true)
  }

  // Copy password to clipboard
  const handleCopyPassword = () => {
    navigator.clipboard.writeText(generatedPassword)
    toast({ title: "Copied", description: "Password copied to clipboard" })
  }

  // Copy new password to clipboard
  const handleCopyNewPassword = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(newGeneratedPassword)
      toast({ title: "Copied", description: "New password copied to clipboard" })
    } else {
      toast({ title: "Error", description: "Clipboard API not supported", variant: "destructive" })
    }
  }

  // Fetch users and roles on component mount
  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [searchTerm, selectedRole, selectedStatus])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (selectedRole !== 'all') params.append('role', selectedRole)
      if (selectedStatus !== 'all') params.append('status', selectedStatus)

      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.users}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('authToken')
      const response = await fetch(API_ENDPOINTS.admin.roles, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch roles')
      }
      const data = await response.json()
      setRoles(data.roles || [])
    } catch (error) {
      console.error('Error fetching roles:', error)
    }
  }

  const handleInviteUser = async () => {
    try {
      if (!newUser.name.trim() || !newUser.email.trim() || !newUser.role || !newUser.password.trim()) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive"
        })
        return
      }

      const token = localStorage.getItem('authToken')
      const response = await fetch(API_ENDPOINTS.admin.users, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          password: newUser.password
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      toast({
        title: "Success",
        description: "User created successfully",
      })

      // Show QR code if available
      if (data.qrCodeUrl) {
        setQrCodeData({
          url: data.qrCodeUrl,
          secret: data.twoFASecret,
          email: newUser.email
        })
        setIsQrDialogOpen(true)
      }

      setNewUser({ name: "", email: "", role: "User", password: "" })
      setIsInviteDialogOpen(false)
      fetchUsers() // Refresh the list
    } catch (error) {
      console.error('Error creating user:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive"
      })
    }
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setIsEditDialogOpen(true)
  }

  const handleUpdateUser = async () => {
    try {
      if (!editingUser || !editingUser.name.trim() || !editingUser.email.trim() || !editingUser.role) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive"
        })
        return
      }

      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.users}/${editingUser._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      toast({
        title: "Success",
        description: "User updated successfully",
      })

      setIsEditDialogOpen(false)
      setEditingUser(null)
      fetchUsers() // Refresh the list
    } catch (error) {
      console.error('Error updating user:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user",
        variant: "destructive"
      })
    }
  }

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'suspended' : 'active'

      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.users}/${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user status')
      }

      toast({
        title: "Success",
        description: `User ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`,
      })

      fetchUsers() // Refresh the list
    } catch (error) {
      console.error('Error updating user status:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user status",
        variant: "destructive"
      })
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.users}/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user')
      }

      toast({
        title: "Success",
        description: "User deleted successfully",
      })

      fetchUsers() // Refresh the list
    } catch (error) {
      console.error('Error deleting user:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete user",
        variant: "destructive"
      })
    }
  }

  const handleResetPassword = (user: User) => {
    setResetPasswordUser(user)
    setIsResetPasswordDialogOpen(true)
  }

  const handleConfirmResetPassword = async () => {
    try {
      if (!resetPasswordUser || !newGeneratedPassword) {
        toast({
          title: "Error",
          description: "No user selected or password generated",
          variant: "destructive"
        })
        return
      }

      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.users}/${resetPasswordUser._id}/reset-password`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword: newGeneratedPassword
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      toast({
        title: "Success",
        description: `Password reset successfully for ${resetPasswordUser.name}. The new password has been set.`,
      })

      setIsResetPasswordDialogOpen(false)
      setResetPasswordUser(null)
      setNewGeneratedPassword("")
      setShowNewPassword(false)
    } catch (error) {
      console.error('Error resetting password:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive"
      })
    }
  }

  const handleResendVerification = async (userId: string) => {
    try {
      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.users}/${userId}/resend-verification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to resend verification')
      }

      toast({ title: "Success", description: "Verification email resent." });
    } catch (err) {
      console.error('Error resending verification:', err)
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to resend verification",
        variant: "destructive"
      });
    }
  };

  const handleViewQrCode = async (userId: string, userEmail: string) => {
    try {
      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.users}/${userId}/qr-code`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to load QR code')
      }

      const data = await response.json()

      setQrCodeData({
        url: data.qrCodeUrl,
        secret: data.twoFASecret,
        email: userEmail
      });
      setIsQrDialogOpen(true);
    } catch (err) {
      console.error('Error loading QR code:', err)
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load QR code",
        variant: "destructive"
      });
    }
  };

  function getStatusBadge(status: string) {
    if (status === "active") return <Badge className="bg-green-100 text-green-800">Active</Badge>;
    if (status === "verifying") return <Badge className="bg-yellow-100 text-yellow-800">Verifying</Badge>;
    if (status === "suspended") return <Badge className="bg-red-100 text-red-800">Suspended</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">Manage user accounts and permissions</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading users...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">Manage user accounts and permissions</p>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Invite User</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New User</DialogTitle>
              <DialogDescription>
                Send an invitation to a new user to join the system.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role._id} value={role.name}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="flex gap-2 items-center">
                  <div className="relative w-full">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={generatedPassword}
                      readOnly
                      style={{ fontFamily: 'monospace' }}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      style={{ background: 'none', border: 'none', padding: 0 }}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <Button type="button" variant="outline" onClick={handleRegeneratePassword}>
                    Regenerate
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCopyPassword}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <small className="text-gray-500">Password will be sent to the user via email.</small>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInviteUser} disabled={!newUser.name.trim() || !newUser.email.trim()}>
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role._id} value={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-gray-900">{user.name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(user.status)}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {new Date(user.joinedDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewQrCode(user._id, user.email)}>
                            <QrCode className="h-4 w-4 mr-2" />
                            View QR Code
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleUserStatus(user._id, user.status)}>
                            <UserX className="h-4 w-4 mr-2" />
                            {user.status === "active" ? "Suspend" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                            <UserIcon className="h-4 w-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResendVerification(user._id)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Resend Verification
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteUser(user._id)}>
                            <UserX className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || selectedRole !== "all" || selectedStatus !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by inviting your first user"
                }
              </p>
              {!searchTerm && selectedRole === "all" && selectedStatus === "all" && (
                <Button onClick={() => setIsInviteDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Invite User
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and permissions.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <Label htmlFor="edit-email">Email Address</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>
              <div>
                <Label htmlFor="edit-role">Role</Label>
                <Select value={editingUser.role} onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role._id} value={role.name}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser}>
              Update User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Generate a new password for {resetPasswordUser?.name}. The user will need to use this new password to log in.
            </DialogDescription>
          </DialogHeader>
          {resetPasswordUser && (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <UserIcon className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium text-yellow-800">User: {resetPasswordUser.name}</span>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  Email: {resetPasswordUser.email}
                </p>
              </div>

              <div>
                <Label htmlFor="new-password">New Password</Label>
                <div className="flex gap-2 items-center">
                  <div className="relative w-full">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newGeneratedPassword}
                      readOnly
                      style={{ fontFamily: 'monospace' }}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowNewPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                      style={{ background: 'none', border: 'none', padding: 0 }}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const pwd = generatePassword()
                      setNewGeneratedPassword(pwd)
                      setShowNewPassword(true)
                    }}
                  >
                    Regenerate
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCopyNewPassword}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Make sure to copy this password before confirming. It cannot be retrieved later.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsResetPasswordDialogOpen(false)
                setResetPasswordUser(null)
                setNewGeneratedPassword("")
                setShowNewPassword(false)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmResetPassword} disabled={!newGeneratedPassword}>
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>2FA Setup QR Code</DialogTitle>
            <DialogDescription>
              Scan this QR code with your authenticator app to set up two-factor authentication for {qrCodeData?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {qrCodeData?.url && (
              <div className="flex justify-center">
                <img
                  src={qrCodeData.url}
                  alt="2FA QR Code"
                  className="w-48 h-48 border rounded-lg"
                />
              </div>
            )}
            {qrCodeData?.secret && (
              <div>
                <Label htmlFor="secret-key">Manual Setup Key</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="secret-key"
                    value={qrCodeData.secret}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(qrCodeData.secret)
                      toast({ title: "Copied", description: "Secret key copied to clipboard" })
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Use this key if you cannot scan the QR code
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsQrDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
