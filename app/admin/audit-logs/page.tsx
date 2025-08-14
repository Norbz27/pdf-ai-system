"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  Activity, 
  Search, 
  Filter,
  Download,
  Eye,
  Clock,
  User,
  FileText,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

// Mock data - replace with real data from your API
const auditLogs = [
  {
    id: 1,
    timestamp: "2024-01-15 14:30:25",
    user: "John Doe",
    userEmail: "john.doe@company.com",
    action: "DOCUMENT_UPLOAD",
    resource: "Q4_Financial_Report.pdf",
    details: "Document uploaded successfully. File size: 2.4MB, Pages: 24",
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "info",
    category: "document"
  },
  {
    id: 2,
    timestamp: "2024-01-15 14:25:10",
    user: "Jane Smith",
    userEmail: "jane.smith@company.com",
    action: "USER_LOGIN",
    resource: "System Login",
    details: "User logged in successfully from new device",
    ipAddress: "192.168.1.105",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    severity: "info",
    category: "authentication"
  },
  {
    id: 3,
    timestamp: "2024-01-15 14:20:15",
    user: "Admin User",
    userEmail: "admin@company.com",
    action: "USER_CREATED",
    resource: "New User: mike.johnson@company.com",
    details: "New user account created with role: Manager",
    ipAddress: "192.168.1.001",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "info",
    category: "user_management"
  },
  {
    id: 4,
    timestamp: "2024-01-15 14:15:30",
    user: "Sarah Wilson",
    userEmail: "sarah.wilson@company.com",
    action: "DOCUMENT_DELETE",
    resource: "Old_Report_2022.pdf",
    details: "Document deleted permanently",
    ipAddress: "192.168.1.110",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "warning",
    category: "document"
  },
  {
    id: 5,
    timestamp: "2024-01-15 14:10:45",
    user: "Unknown",
    userEmail: "unknown@unknown.com",
    action: "LOGIN_FAILED",
    resource: "Failed Login Attempt",
    details: "Failed login attempt for user: admin@company.com",
    ipAddress: "203.0.113.45",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "error",
    category: "security"
  },
  {
    id: 6,
    timestamp: "2024-01-15 14:05:20",
    user: "Admin User",
    userEmail: "admin@company.com",
    action: "ROLE_UPDATED",
    resource: "Role: Manager",
    details: "Role permissions updated. Added: can_export_data",
    ipAddress: "192.168.1.001",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    severity: "info",
    category: "role_management"
  },
  {
    id: 7,
    timestamp: "2024-01-15 14:00:10",
    user: "Mike Johnson",
    userEmail: "mike.johnson@company.com",
    action: "DOCUMENT_QUERY",
    resource: "AI Query",
    details: "Query: 'What are the Q4 revenue figures?' - Documents searched: 3",
    ipAddress: "192.168.1.115",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    severity: "info",
    category: "ai_query"
  },
  {
    id: 8,
    timestamp: "2024-01-15 13:55:30",
    user: "Admin User",
    userEmail: "admin@company.com",
    action: "SYSTEM_BACKUP",
    resource: "Database Backup",
    details: "Automated backup completed successfully. Size: 1.2GB",
    ipAddress: "192.168.1.001",
    userAgent: "System/BackupService",
    severity: "info",
    category: "system"
  }
]

const actionCategories = [
  { value: "all", label: "All Categories" },
  { value: "authentication", label: "Authentication" },
  { value: "document", label: "Document Management" },
  { value: "user_management", label: "User Management" },
  { value: "role_management", label: "Role Management" },
  { value: "ai_query", label: "AI Queries" },
  { value: "security", label: "Security" },
  { value: "system", label: "System" }
]

const severityLevels = [
  { value: "all", label: "All Severities" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" }
]

export default function AuditLogsPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedSeverity, setSelectedSeverity] = useState("all")
  const [selectedDateRange, setSelectedDateRange] = useState("all")
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.details.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === "all" || log.category === selectedCategory
    const matchesSeverity = selectedSeverity === "all" || log.severity === selectedSeverity
    return matchesSearch && matchesCategory && matchesSeverity
  })

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "info":
        return <Badge className="bg-blue-100 text-blue-800">Info</Badge>
      case "warning":
        return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
      case "error":
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case "DOCUMENT_UPLOAD":
      case "DOCUMENT_DELETE":
      case "DOCUMENT_QUERY":
        return <FileText className="h-4 w-4" />
      case "USER_LOGIN":
      case "USER_CREATED":
      case "LOGIN_FAILED":
        return <User className="h-4 w-4" />
      case "ROLE_UPDATED":
        return <Shield className="h-4 w-4" />
      case "SYSTEM_BACKUP":
        return <Activity className="h-4 w-4" />
      default:
        return <Info className="h-4 w-4" />
    }
  }

  const handleViewDetails = (log: any) => {
    setSelectedLog(log)
    setIsDetailDialogOpen(true)
  }

  const exportLogs = () => {
    // Add API call here to export logs
    console.log("Exporting audit logs...")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-600">Track and monitor all system activities</p>
        </div>
        <Button variant="outline" onClick={exportLogs} className="flex items-center space-x-2">
          <Download className="h-4 w-4" />
          <span>Export Logs</span>
        </Button>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actionCategories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {severityLevels.map((severity) => (
                    <SelectItem key={severity.value} value={severity.value}>
                      {severity.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={selectedDateRange} onValueChange={setSelectedDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>System Activity ({filteredLogs.length} logs)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{log.timestamp}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src="/placeholder-user.jpg" />
                          <AvatarFallback className="text-xs">
                            {log.user.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-gray-900">{log.user}</div>
                          <div className="text-xs text-gray-500">{log.userEmail}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getActionIcon(log.action)}
                        <span className="text-sm font-medium">{log.action.replace(/_/g, ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-gray-600">
                      {log.resource}
                    </TableCell>
                    <TableCell>
                      {getSeverityBadge(log.severity)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 font-mono">
                      {log.ipAddress}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredLogs.length === 0 && (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No audit logs found</h3>
              <p className="text-gray-500">
                Try adjusting your search or filters to find the logs you're looking for.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Details Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Detailed information about this system activity.
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Timestamp</Label>
                  <p className="text-sm text-gray-900">{selectedLog.timestamp}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Severity</Label>
                  <div className="mt-1">{getSeverityBadge(selectedLog.severity)}</div>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-500">User</Label>
                <p className="text-sm text-gray-900">{selectedLog.user} ({selectedLog.userEmail})</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-500">Action</Label>
                <p className="text-sm text-gray-900">{selectedLog.action.replace(/_/g, ' ')}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-500">Resource</Label>
                <p className="text-sm text-gray-900">{selectedLog.resource}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-500">Details</Label>
                <p className="text-sm text-gray-900">{selectedLog.details}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">IP Address</Label>
                  <p className="text-sm font-mono text-gray-900">{selectedLog.ipAddress}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Category</Label>
                  <p className="text-sm text-gray-900">{selectedLog.category.replace(/_/g, ' ')}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-500">User Agent</Label>
                <p className="text-sm text-gray-900 break-all">{selectedLog.userAgent}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
} 