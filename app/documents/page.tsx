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
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ReactSelect from "react-select"

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
        // Fetch documents
        const docsRes = await fetch(`/api/documents?userId=${userId}&userRole=${userRole}`)
        if (!docsRes.ok) throw new Error("Failed to fetch documents")
        const docsData = await docsRes.json()
        setDocuments(docsData.documents || [])

        // Fetch categories
        const catsRes = await fetch("/api/categories")
        if (catsRes.ok) {
          const catsData = await catsRes.json()
          setCategories(catsData.categories || [])
        }

        // Fetch roles
        const rolesRes = await fetch("/api/roles", {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        })
        if (rolesRes.ok) {
          const rolesData = await rolesRes.json()
          setRoles(rolesData.roles || [])
        }

        // Fetch users
        const usersRes = await fetch("/api/users", {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        })
        if (usersRes.ok) {
          const usersData = await usersRes.json()
          setUsers(usersData.users || [])
        }
      } catch (err: any) {
        setError(err.message || "Failed to fetch data")
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
    fetch(`/api/download?filePath=${encodeURIComponent(doc.filePath)}&fileName=${encodeURIComponent(fileName)}`)
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
      const res = await fetch(`/api/documents/${managingAccessDoc._id}/access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          type: searchType,
          values: targets
        })
      });
      if (res.ok) {
        toast({
          title: "Success",
          description: "Access added successfully"
        });
        setAccessName([]);
        setAccessRole([]);
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || 'Failed to add access',
          variant: "destructive"
        });
      }
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
    if (!confirm(`Are you sure you want to delete '${doc.name}'?`)) return;
    try {
      const res = await fetch(`/api/documents?id=${doc._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete document");
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Access for: {managingAccessDoc?.name}</DialogTitle>
          </DialogHeader>
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
                  options={users.map(u => ({ value: u.name, label: u.name }))}
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
                  options={roles.map(r => ({ value: r.name, label: r.name }))}
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

            <Button onClick={handleAddAccess}>Add Access</Button>
          </div>
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
                          {user && doc.uploadedBy?.toString() !== user._id && doc.sharedWith?.some((id: string) => id === user._id) && <Badge variant="secondary">Shared</Badge>}
                          </div>
                            <p className="text-sm text-gray-600 mb-3">{doc.description}</p>
                          <div className="flex items-center space-x-6 text-xs text-gray-500">
                            <span>{doc.size || 'Unknown size'}</span>
                              <span>Uploaded {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "-"}</span>
                          </div>
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
                                <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(doc)}>
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
      </UserLayout>
    </AuthGuard>
  )
}
