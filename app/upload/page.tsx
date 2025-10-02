"use client"

import type React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { FileText, Upload, X, CheckCircle, AlertCircle, Settings, FolderOpen, Plus } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Link from "next/link"
import UserLayout from "@/app/user-layout"
import AuthGuard from "@/app/components/AuthGuard"
import { useUser } from "@/app/contexts/UserContext"
import { getCategories, uploadDocument, getDocumentById } from "@/lib/api-client"

interface UploadFile {
  id: string
  file: File
  category: string
  description: string
  status: "pending" | "uploading" | "processing" | "completed" | "error"
  progress: number
  error?: string
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useUser()

  // Fetch categories from FastAPI
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const data = await getCategories(token);
          setCategories(data.categories || []);
        } else {
          console.warn('No auth token available for categories request');
          setCategories([]);
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if user is authenticated
    if (user && user.status === 'active') {
      fetchCategories();
    } else {
      setLoading(false);
    }
  }, [user])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    handleFiles(droppedFiles)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      handleFiles(selectedFiles)
    }
  }

  const handleFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles
      .filter((file) => file.type === "application/pdf")
      .map((file) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        category: "",
        description: "",
        status: "pending" as const,
        progress: 0,
      }))

    setFiles((prev) => [...prev, ...uploadFiles])
  }

  const updateFile = (id: string, updates: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((file) => (file.id === id ? { ...file, ...updates } : file)))
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id))
  }

  const handleFileUpload = async (file: UploadFile) => {
    if (!user) {
      updateFile(file.id, { status: "error", error: "User not authenticated." });
      return;
    }

    updateFile(file.id, { status: "uploading", progress: 0 });

    try {
      const response = await uploadDocument({
        file: file.file,
        categoryId: file.category,
        description: file.description,
        uploadedBy: user._id,
      });

      const { id: document_id } = response;
      updateFile(file.id, { status: "processing", progress: 100 });

      const pollStatus = async () => {
        try {
          const doc = await getDocumentById(document_id, { userId: user._id, userRole: user.role });
          if (doc.document.status === "processed") {
            updateFile(file.id, { status: "completed" });
          } else {
            setTimeout(pollStatus, 5000); // Poll every 5s
          }
        } catch (error) {
          console.error("Polling error:", error);
          setTimeout(pollStatus, 5000);
        }
      };
      setTimeout(pollStatus, 5000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateFile(file.id, { status: "error", error: errorMessage });
    }
  };

  const uploadAllFiles = () => {
    files.filter((file) => file.status === "pending" && file.category).forEach(handleFileUpload)
  }

  const getStatusIcon = (status: UploadFile["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />
      case "uploading":
      case "processing":
        return <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      default:
        return <FileText className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusText = (status: UploadFile["status"]) => {
    switch (status) {
      case "pending":
        return "Ready to upload"
      case "uploading":
        return "Uploading..."
      case "processing":
        return "Processing with AI..."
      case "completed":
        return "Complete"
      case "error":
        return "Upload failed"
      default:
        return ""
    }
  }

  // Helper function to format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: UploadFile["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800"
      case "error":
        return "bg-red-100 text-red-800"
      case "uploading":
        return "bg-blue-100 text-blue-800"
      case "processing":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  // Custom function for Choose Files button
  const handleChooseFilesClick = () => {
    // You can add any custom logic here (e.g., logging, analytics, validation)
    // For now, just open the file dialog
    fileInputRef.current?.click();
  }

  return (
    <AuthGuard requiredPermissions={['user_page_access']}>
      <UserLayout>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Upload Documents</h1>
          <p className="text-gray-600 mt-2">
            Upload your PDF documents to make them searchable and interactive with AI
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upload Area */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Documents</CardTitle>
                <CardDescription>
                  Drag and drop PDF files or click to browse. Maximum file size: 50MB per file.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">Drop your PDF files here</p>
                  <p className="text-gray-600 mb-4">or click to browse from your computer</p>
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-upload"
                    ref={fileInputRef}
                  />
                  <Button variant="outline" className="cursor-pointer bg-transparent" onClick={handleChooseFilesClick} type="button">
                      <Plus className="h-4 w-4 mr-2" />
                      Choose Files
                    </Button>
                </div>
              </CardContent>
            </Card>

            {/* File List */}
            {files.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Files to Upload ({files.length})</CardTitle>
                      <CardDescription>Configure your documents before uploading</CardDescription>
                    </div>
                    <Button
                      onClick={uploadAllFiles}
                      disabled={files.every((f) => f.status !== "pending" || !f.category)}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {files.map((file) => (
                      <div key={file.id} className="border rounded-lg p-4">
                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0">{getStatusIcon(file.status)}</div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium text-gray-900 truncate">{file.file.name}</h4>
                              <div className="flex items-center space-x-2">
                                <Badge className={getStatusColor(file.status)}>{getStatusText(file.status)}</Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFile(file.id)}
                                  disabled={file.status === "uploading" || file.status === "processing"}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="text-xs text-gray-500 mb-3">
                              {formatFileSize(file.file.size)}
                            </div>

                            {(file.status === "uploading" || file.status === "processing") && (
                              <div className="mb-3">
                                <Progress value={file.progress} className="h-2" />
                                <p className="text-xs text-gray-500 mt-1">{file.progress.toFixed(0)}% complete</p>
                              </div>
                            )}

                            {file.error && (
                              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                                {file.error}
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor={`category-${file.id}`} className="text-xs">
                                  Category *
                                </Label>
                                <Select
                                  value={file.category}
                                  onValueChange={(value) => updateFile(file.id, { category: value })}
                                  disabled={file.status === "uploading" || file.status === "processing"}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categories.map((category) => (
                                      <SelectItem key={category._id} value={category._id}>
                                        {category.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label htmlFor={`description-${file.id}`} className="text-xs">
                                  Description (Optional)
                                </Label>
                                <Input
                                  id={`description-${file.id}`}
                                  placeholder="Brief description..."
                                  value={file.description}
                                  onChange={(e) => updateFile(file.id, { description: e.target.value })}
                                  disabled={file.status === "uploading" || file.status === "processing"}
                                  className="h-8"
                                />
                              </div>
                            </div>

                            {file.status === "pending" && file.category && (
                              <div className="mt-3">
                                <Button size="sm" onClick={() => handleFileUpload(file)} className="h-8">
                                  <Upload className="h-3 w-3 mr-1" />
                                  Upload
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upload Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Supported Formats</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• PDF documents only</li>
                    <li>• Maximum 50MB per file</li>
                    <li>• Text-based PDFs preferred</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Best Practices</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Use descriptive file names</li>
                    <li>• Select appropriate categories</li>
                    <li>• Add brief descriptions</li>
                    <li>• Ensure text is searchable</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Processing Time</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Small files: 1-2 minutes</li>
                    <li>• Large files: 3-5 minutes</li>
                    <li>• Complex layouts: 5-10 minutes</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Uploads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Employee Handbook 2024</p>
                      <p className="text-xs text-gray-500">2 hours ago</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Q4 Financial Report</p>
                      <p className="text-xs text-gray-500">1 day ago</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Product Catalog 2024</p>
                      <p className="text-xs text-gray-500">3 days ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/documents" className="w-full">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <FileText className="h-4 w-4 mr-2" />
                    View All Documents
                  </Button>
                </Link>
                <Link href="/chat" className="w-full">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <Upload className="h-4 w-4 mr-2" />
                    Start AI Chat
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </UserLayout>
    </AuthGuard>
  )
}
