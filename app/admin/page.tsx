"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  FileText, 
  Users, 
  MessageSquare, 
  TrendingUp,
  Upload,
  Eye,
  Clock,
  User
} from "lucide-react"

// Mock data - replace with real data from your API
const stats = [
  {
    title: "Total Documents",
    value: "1,234",
    change: "+12%",
    changeType: "positive",
    icon: FileText,
    color: "text-blue-600"
  },
  {
    title: "Total Users",
    value: "89",
    change: "+5%",
    changeType: "positive",
    icon: Users,
    color: "text-green-600"
  },
  {
    title: "Total Queries",
    value: "5,678",
    change: "+23%",
    changeType: "positive",
    icon: MessageSquare,
    color: "text-purple-600"
  },
  {
    title: "Processing Rate",
    value: "98.5%",
    change: "+2.1%",
    changeType: "positive",
    icon: TrendingUp,
    color: "text-orange-600"
  }
]

const recentActivity = [
  {
    id: 1,
    type: "upload",
    user: "John Doe",
    action: "uploaded",
    document: "Q4_Financial_Report.pdf",
    time: "2 minutes ago",
    avatar: "/placeholder-user.jpg"
  },
  {
    id: 2,
    type: "query",
    user: "Jane Smith",
    action: "queried",
    document: "Technical_Manual.pdf",
    time: "5 minutes ago",
    avatar: "/placeholder-user.jpg"
  },
  {
    id: 3,
    type: "login",
    user: "Mike Johnson",
    action: "logged in",
    document: null,
    time: "10 minutes ago",
    avatar: "/placeholder-user.jpg"
  },
  {
    id: 4,
    type: "upload",
    user: "Sarah Wilson",
    action: "uploaded",
    document: "Product_Catalog.pdf",
    time: "15 minutes ago",
    avatar: "/placeholder-user.jpg"
  }
]

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's what's happening with your system.</p>
        </div>
        <Button className="flex items-center space-x-2">
          <Upload className="h-4 w-4" />
          <span>Upload Document</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="flex items-center space-x-1">
                <Badge 
                  variant={stat.changeType === "positive" ? "default" : "destructive"}
                  className="text-xs"
                >
                  {stat.change}
                </Badge>
                <span className="text-xs text-gray-500">from last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Trends Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Document Upload Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Chart component would go here</p>
                  <p className="text-sm text-gray-400">Showing upload trends over the last 30 days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={activity.avatar} />
                      <AvatarFallback>
                        {activity.user.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{activity.user}</span>
                        {' '}{activity.action}
                        {activity.document && (
                          <>
                            {' '}<span className="font-medium">{activity.document}</span>
                          </>
                        )}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">{activity.time}</span>
                      </div>
                    </div>
                    <Badge 
                      variant={
                        activity.type === "upload" ? "default" : 
                        activity.type === "query" ? "secondary" : "outline"
                      }
                      className="text-xs"
                    >
                      {activity.type}
                    </Badge>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View All Activity
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Manage Documents</h3>
                <p className="text-sm text-gray-500">View and organize your PDF files</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">User Management</h3>
                <p className="text-sm text-gray-500">Manage user accounts and permissions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Eye className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">System Analytics</h3>
                <p className="text-sm text-gray-500">View detailed system performance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 