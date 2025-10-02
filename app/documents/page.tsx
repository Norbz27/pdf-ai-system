"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  FileText,
  Upload,
  MessageSquare,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Download,
  Trash2,
  Plus,
  BarChart3,
  Clock,
  Users,
  Settings,
  Key,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import ReactMarkdown from 'react-markdown';
import Link from "next/link"
import UserLayout from "@/app/user-layout"
import AuthGuard from "@/app/components/AuthGuard"
import { useToast } from "@/hooks/use-toast"
import { useUser } from "../contexts/UserContext"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import ReactSelect from "react-select"
import { listDocumentsWithFilters, getCategories, getRoles, getUsers, grantDocumentAccess, deleteDocument as deleteDocumentApi } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api";

export default function Dashboard() {
  const { toast } = useToast()
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [documents, setDocuments] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingDoc, setViewingDoc] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [managingAccessDoc, setManagingAccessDoc] = useState<any | null>(null);
  const [searchType, setSearchType] = useState("name");
  const [accessName, setAccessName] = useState<string[]>([]);
  const [accessRole, setAccessRole] = useState<string[]>([]);

  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [docToDelete, setDocToDelete] = useState<any | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const userId = user._id;
        const userRole = user.role;
        // Fetch documents from FastAPI
        const docsData = await listDocumentsWithFilters({ userId, userRole })
        setDocuments(docsData.documents || [])
        const token = localStorage.getItem('authToken');
        if (token) {
          const catsData = await getCategories(token);
          setCategories(catsData.categories || []);
        } else {
          console.warn('No auth token available for categories request');
          setCategories([]);
        }
        const rolesData = await getRoles()
        setRoles(rolesData.roles || [])
        const usersData = await getUsers()
        setUsers(usersData.users || [])
      } catch (err) {
        setError("Failed to fetch data")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  const stats = [
    { label: "Total Documents", value: documents.length.toString(), icon: FileText, change: "+3 this week" }
  ]

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === "all" || doc.categoryName === selectedCategory
    return matchesSearch && matchesCategory
  })

  const router = useRouter();

  // Helper function to format file size
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    if (typeof bytes !== 'number' || isNaN(bytes)) return 'Unknown size';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handler for viewing a document (popup modal)
  const handleViewDocument = (doc: any) => {
    setViewingDoc(doc);
  };

  // Handler for chatting with AI about a document
  const handleChatWithAI = (doc: any) => {
    // Pass document ID or name as query param
    router.push(`/chat?docId=${doc._id}`);
  };

  // Handler for downloading a document
  const handleDownload = (doc: any) => {
    if (!doc.filePath) {
      toast({
        title: "Error",
        description: "No file path available for download.",
        variant: "destructive"
      });
      return;
    }
    // Create a download link and trigger it
    const fileName = doc.name || "document.pdf";
    fetch(`${API_ENDPOINTS.download}?filePath=${encodeURIComponent(doc.filePath)}&fileName=${encodeURIComponent(fileName)}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to download file");
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => {
        toast({
          title: "Error",
          description: err.message || "Failed to download file",
          variant: "destructive"
        });
      });
  };

  // Handler for managing access
  const handleManageAccess = (doc: any) => {
    setManagingAccessDoc(doc);
  };

  // Handler for adding access
  const handleAddAccess = async () => {
    const targets = searchType === "name" ? accessName : accessRole;
    if (!targets || targets.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select a user or role",
        variant: "destructive"
      });
      return;
    }
    try {
      const token = localStorage.getItem('authToken') || undefined;
      await grantDocumentAccess(managingAccessDoc._id, { type: searchType, values: targets }, token);
      toast({ title: "Success", description: "Access added successfully" });
      setAccessName([]);
      setAccessRole([]);
    } catch (err) {
      toast({
        title: "Error",
        description: 'Error adding access',
        variant: "destructive"
      });
    }
  };

  // Handler for deleting a document
  const handleDelete = async (doc: any) => {
    try {
      await deleteDocumentApi(doc._id);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete document",
        variant: "destructive"
      });
    }
  };

  return (
    <AuthGuard requiredPermissions={['user_page_access']}>
      <UserLayout>
      {/* Modal for viewing document */}
      <Dialog open={!!viewingDoc} onOpenChange={(open) => !open && setViewingDoc(null)}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle>View Document: {viewingDoc?.name}</DialogTitle>
          </DialogHeader>
          {viewingDoc?.filePath ? (
            <div style={{ width: '100%', height: '70vh' }}>
              <iframe
                src={`/pdfjs/web/viewer.html?file=/uploads/${encodeURIComponent(viewingDoc.name)}#view=page&sidebar=0`}
                title={viewingDoc.name}
                width="100%"
                height="100%"
                style={{ border: 'none' }}
              />
            </div>
          ) : (
            <div className="text-red-600">No file available for this document.</div>
          )}
          <DialogClose asChild>
            <Button variant="outline" className="mt-4">Close</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

      {/* Modal for managing access */}
      <Dialog open={!!managingAccessDoc} onOpenChange={(open) => !open && setManagingAccessDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Access for: {managingAccessDoc?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Current Shared Users */}
            <div>
              <h3 className="text-sm font-medium mb-2">Shared with Users</h3>
              <div className="flex flex-wrap gap-2">
                {managingAccessDoc?.sharedUserNames && managingAccessDoc.sharedUserNames.length > 0 ? (
                  managingAccessDoc.sharedUserNames.map((userName: string, index: number) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {userName}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No users shared</p>
                )}
              </div>
            </div>

            {/* Current Role Grants */}
            <div>
              <h3 className="text-sm font-medium mb-2">Granted Roles</h3>
              <div className="flex flex-wrap gap-2">
                {managingAccessDoc?.accessGrants && managingAccessDoc.accessGrants.some((grant: any) => grant.type === "role") ? (
                  managingAccessDoc.accessGrants
                    .filter((grant: any) => grant.type === "role")
                    .map((grant: any, index: number) => (
                      <Badge key={index} variant="outline" className="flex items-center gap-1">
                        {roles.find(r => r._id === grant.value)?.name || grant.value}
                      </Badge>
                    ))
                ) : (
                  <p className="text-sm text-gray-500">No roles granted</p>
                )}
              </div>
            </div>

            {/* Public Access Toggle */}
            {managingAccessDoc && user && managingAccessDoc.uploadedBy?.toString() === user._id && (
              <div>
                <label className="block text-sm font-medium mb-2">Public Access</label>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={managingAccessDoc.publicAccess || false}
                    onCheckedChange={async (checked) => {
                      try {
                        const token = localStorage.getItem('authToken') || undefined;
                        await fetch(API_ENDPOINTS.documents.publicAccess(managingAccessDoc._id), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({ publicAccess: checked }),
                        });
                        toast({ title: "Success", description: "Public access updated" });
                        // Update local state
                        setManagingAccessDoc((prev: any) => prev ? { ...prev, publicAccess: checked } : null);
                        // Refresh documents
                        const refreshedDocs = await listDocumentsWithFilters({ userId: user._id, userRole: user.role });
                        setDocuments(refreshedDocs.documents || []);
                      } catch (err) {
                        toast({
                          title: "Error",
                          description: "Failed to update public access",
                          variant: "destructive",
                        });
                      }
                    }}
                  />
                  <span className="text-sm text-gray-700">
                    {managingAccessDoc.publicAccess ? "Public (anyone can view)" : "Private"}
                  </span>
                </div>
              </div>
            )}

            {/* Add New Access */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-2">Add New Access</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Search Type</label>
                  <Select value={searchType} onValueChange={setSearchType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select search type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">By Name</SelectItem>
                      <SelectItem value="role">By Role</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {searchType === "name" ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">User Name</label>
                    <ReactSelect
                      isMulti
                      options={managingAccessDoc ? users.filter(u => u._id !== managingAccessDoc.uploadedBy).map(u => ({ value: u.name, label: u.name })) : []}
                      value={accessName.map(name => ({ value: name, label: name }))}
                      onChange={(selected) => setAccessName(selected ? selected.map(s => s.value) : [])}
                      isSearchable
                      placeholder="Select users"
                      styles={{
                        control: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                          borderColor: '#d1d5db',
                          borderRadius: '6px',
                          minHeight: '36px',
                          boxShadow: 'none',
                          '&:hover': {
                            borderColor: '#9ca3af',
                          },
                        }),
                        option: (provided, state) => ({
                          ...provided,
                          fontSize: '14px',
                          backgroundColor: state.isFocused ? '#D9D9D9' : 'white',
                          color: state.isFocused ? 'black' : 'black',
                        }),
                        placeholder: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                          color: '#9ca3af',
                        }),
                        multiValue: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                        }),
                        multiValueLabel: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                        }),
                        multiValueRemove: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                        }),
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">Role</label>
                    <ReactSelect
                      isMulti
                      options={roles.filter(r => r.name !== 'Admin').map(r => ({ value: r.name, label: r.name }))}
                      value={accessRole.map(role => ({ value: role, label: role }))}
                      onChange={(selected) => setAccessRole(selected ? selected.map(s => s.value) : [])}
                      isSearchable
                      placeholder="Select roles"
                      styles={{
                        control: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                          borderColor: '#d1d5db',
                          borderRadius: '6px',
                          minHeight: '36px',
                          boxShadow: 'none',
                          '&:hover': {
                            borderColor: '#9ca3af',
                          },
                        }),
                        option: (provided, state) => ({
                          ...provided,
                          fontSize: '14px',
                          backgroundColor: state.isFocused ? '#D9D9D9' : 'white',
                          color: state.isFocused ? 'black' : 'black',
                        }),
                        placeholder: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                          color: '#9ca3af',
                        }),
                        multiValue: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                        }),
                        multiValueLabel: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                        }),
                        multiValueRemove: (provided) => ({
                          ...provided,
                          fontSize: '14px',
                        }),
                      }}
                    />
                  </div>
                )}
                <Button onClick={handleAddAccess} className="w-full">Add Access</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        
        {/* Main Content */}
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          {/* Stats Overview */}
          <div className="lg:col-span-1 space-y-6">
            {stats.map((stat, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
                    </div>
                    <stat.icon className="h-8 w-8 text-600" />
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedCategory === "all"
                        ? "bg-[#D9D9D9] font-medium"
                        : "hover:bg-gray-100 text-gray-600"
                    }`}
                  >
                    All Documents
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category._id}
                      onClick={() => setSelectedCategory(category.name)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedCategory === category.name
                          ? "bg-[#D9D9D9] font-medium"
                          : "hover:bg-gray-100 text-gray-600"
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Document Library</CardTitle>
                    <CardDescription>Manage and interact with your uploaded documents</CardDescription>
                  </div>
                  <Link href="/upload">
                    <Button variant="dark">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Document
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {/* Search and Filter */}
                <div className="flex space-x-4 mb-6">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search documents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </div>

                {/* Documents List */}
                <div className="space-y-4">
                  {loading ? (
                    <div>Loading documents...</div>
                  ) : error ? (
                    <div className="text-red-600">{error}</div>
                  ) : filteredDocuments.length === 0 ? (
                    <div>No documents found.</div>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <div key={doc._id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <FileText className="h-5 w-5" />
                            <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                          <Badge variant="outline">{doc.categoryName || 'Uncategorized'}</Badge>
                          {doc.publicAccess && <Badge variant="secondary">Public</Badge>}
                          {user && doc.uploadedBy?.toString() !== user._id && !doc.publicAccess && doc.sharedWith?.some((id: string) => id === user._id) && <Badge variant="secondary">Shared</Badge>}
                          </div>
                            <p className="text-sm text-gray-600 mb-3">{doc.description}</p>
                          <div className="flex items-center space-x-6 text-xs text-gray-500">
                            <span>{doc.size || 'Unknown size'}</span>
                              <span>Uploaded {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "-"}</span>
                          </div>
                          {doc.accessGrants && doc.accessGrants.some((grant: any) => grant.type === "role") && (
                            <div className="text-xs text-gray-500 mt-1">
                              Granted to roles: {doc.accessGrants.filter((grant: any) => grant.type === "role").map((grant: any) => roles.find(r => r._id === grant.value)?.name || grant.value).join(", ")}
                            </div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDocument(doc)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Document
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleChatWithAI(doc)}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Chat with AI
                            </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownload(doc)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                              {doc.uploadedBy?.toString() === user?._id && (
                                <DropdownMenuItem onClick={() => handleManageAccess(doc)}>
                                  <Key className="h-4 w-4 mr-2" />
                                  Manage Access
                                </DropdownMenuItem>
                              )}
                              {doc.uploadedBy?.toString() === user?._id && (
                                <DropdownMenuItem className="text-red-600" onClick={() => setDocToDelete(doc)}>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <Dialog open={!!docToDelete} onOpenChange={() => setDocToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the document
                <span className="font-bold"> {docToDelete?.name}</span>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDocToDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (docToDelete) {
                    await handleDelete(docToDelete);
                    setDocToDelete(null);
                  }
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </UserLayout>
    </AuthGuard>
  )
}
