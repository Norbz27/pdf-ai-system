"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  Users,
  Check
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
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { API_ENDPOINTS } from "@/lib/api"

interface Role {
  _id: string
  name: string
  description: string
  permissions: string[]
  userCount: number
  createdAt: string
  updatedAt: string
}

interface Permission {
  id: string
  label: string
  description: string
}

const availablePermissions: Permission[] = [
  { id: "user_page_access", label: "User Page Access", description: "Can access user dashboard and chat with AI" },
  { id: "admin_access", label: "Admin Access", description: "Can access admin dashboard" },
  { id: "can_upload", label: "Upload Documents", description: "Can upload new PDF documents" },
  { id: "can_view", label: "View Documents", description: "Can view and search documents" },
  { id: "can_edit", label: "Edit Documents", description: "Can edit document metadata and categories" },
  { id: "can_delete", label: "Delete Documents", description: "Can delete documents from the system" },
  { id: "can_manage_users", label: "Manage Users", description: "Can invite, edit, and manage user accounts" },
  { id: "can_manage_roles", label: "Manage Roles", description: "Can create and edit role permissions" },
  { id: "can_view_analytics", label: "View Analytics", description: "Can access system analytics and reports" },
  { id: "can_export_data", label: "Export Data", description: "Can export documents and data" }
]

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
    permissions: [] as string[]
  })
  const { toast } = useToast()

  // Fetch roles on component mount
  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      setLoading(true)

      // First recalculate user counts to ensure accuracy
      const token = localStorage.getItem('authToken')
      const response = await fetch(`${API_ENDPOINTS.admin.roles}/recalculate-user-count`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to recalculate user counts')
      }

      const rolesResponse = await fetch(API_ENDPOINTS.admin.roles, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!rolesResponse.ok) {
        throw new Error('Failed to fetch roles')
      }
      const data = await rolesResponse.json()
      setRoles(data.roles || [])
    } catch (error) {
      console.error('Error fetching roles:', error)
      toast({
        title: "Error",
        description: "Failed to fetch roles",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRole = async () => {
    try {
      if (!newRole.name.trim() || !newRole.description.trim()) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive"
        })
        return
      }

      const response = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRole),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create role')
      }

      toast({
        title: "Success",
        description: "Role created successfully",
      })

      setNewRole({ name: "", description: "", permissions: [] })
      setIsCreateDialogOpen(false)
      fetchRoles() // Refresh the list
    } catch (error) {
      console.error('Error creating role:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create role",
        variant: "destructive"
      })
    }
  }

  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    setIsEditDialogOpen(true)
  }

  const handleUpdateRole = async () => {
    try {
      if (!editingRole || !editingRole.name.trim() || !editingRole.description.trim()) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive"
        })
        return
      }

      const response = await fetch(`/api/admin/roles/${editingRole._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingRole.name,
          description: editingRole.description,
          permissions: editingRole.permissions,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update role')
      }

      toast({
        title: "Success",
        description: "Role updated successfully",
      })

      setIsEditDialogOpen(false)
      setEditingRole(null)
      fetchRoles() // Refresh the list
    } catch (error) {
      console.error('Error updating role:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update role",
        variant: "destructive"
      })
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    try {
      const response = await fetch(`/api/admin/roles/${roleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete role')
      }

      toast({
        title: "Success",
        description: "Role deleted successfully",
      })

      fetchRoles() // Refresh the list
    } catch (error) {
      console.error('Error deleting role:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete role",
        variant: "destructive"
      })
    }
  }

  const handlePermissionToggle = (permissionId: string, isNewRole: boolean = true) => {
    if (isNewRole) {
      setNewRole(prev => ({
        ...prev,
        permissions: prev.permissions.includes(permissionId)
          ? prev.permissions.filter((p: string) => p !== permissionId)
          : [...prev.permissions, permissionId]
      }))
    } else if (editingRole) {
      setEditingRole(prev => {
        if (!prev) return prev
        return {
          ...prev,
          permissions: prev.permissions.includes(permissionId)
            ? prev.permissions.filter((p: string) => p !== permissionId)
            : [...prev.permissions, permissionId]
        }
      })
    }
  }

  const getPermissionsSummary = (permissions: string[]) => {
    const count = permissions.length
    if (count === 0) return "No permissions"
    if (count === availablePermissions.length) return "All permissions"
    return `${count} permissions`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Roles</h1>
          <p className="text-gray-600">Define permissions and role-based access control</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading roles...</div>
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
          <h1 className="text-3xl font-bold text-gray-900">Roles</h1>
          <p className="text-gray-600">Define permissions and role-based access control</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Create Role</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
              <DialogDescription>
                Define a new role with specific permissions for your users.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Role Name</Label>
                <Input
                  id="name"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                  placeholder="Enter role name"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  placeholder="Enter role description"
                  rows={3}
                />
              </div>
              <div>
                <Label className="text-base font-medium">Permissions</Label>
                <div className="mt-2 space-y-3 max-h-60 overflow-y-auto">
                  {availablePermissions.map((permission) => (
                    <div key={permission.id} className="flex items-start space-x-3">
                      <Checkbox
                        id={permission.id}
                        checked={newRole.permissions.includes(permission.id)}
                        onCheckedChange={() => handlePermissionToggle(permission.id)}
                      />
                      <div className="flex-1">
                        <Label htmlFor={permission.id} className="text-sm font-medium">
                          {permission.label}
                        </Label>
                        <p className="text-xs text-gray-500">{permission.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRole}>
                Create Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Roles Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Roles ({roles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role._id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Shield className="h-8 w-8 text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900">{role.name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 max-w-xs truncate">
                      {role.description}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">
                          {getPermissionsSummary(role.permissions)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-900">{role.userCount}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {new Date(role.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditRole(role)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteRole(role._id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
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

          {roles.length === 0 && (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No roles found</h3>
              <p className="text-gray-500 mb-4">
                Get started by creating your first role with specific permissions.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Role
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update role information and permissions.
            </DialogDescription>
          </DialogHeader>
          {editingRole && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Role Name</Label>
                <Input
                  id="edit-name"
                  value={editingRole.name}
                  onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                  placeholder="Enter role name"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingRole.description}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  placeholder="Enter role description"
                  rows={3}
                />
              </div>
              <div>
                <Label className="text-base font-medium">Permissions</Label>
                <div className="mt-2 space-y-3 max-h-60 overflow-y-auto">
                  {availablePermissions.map((permission) => (
                    <div key={permission.id} className="flex items-start space-x-3">
                      <Checkbox
                        id={`edit-${permission.id}`}
                        checked={editingRole.permissions.includes(permission.id)}
                        onCheckedChange={() => handlePermissionToggle(permission.id, false)}
                      />
                      <div className="flex-1">
                        <Label htmlFor={`edit-${permission.id}`} className="text-sm font-medium">
                          {permission.label}
                        </Label>
                        <p className="text-xs text-gray-500">{permission.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRole}>
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
