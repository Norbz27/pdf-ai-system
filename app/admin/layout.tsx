"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { 
  LayoutDashboard, 
  FileText, 
  FolderOpen, 
  Users, 
  Shield,
  Menu,
  X,
  Bell,
  Search,
  ChevronDown,
  Activity,
  User,
  LogOut,
  Settings
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import AuthGuard from "@/app/components/AuthGuard"
import { useUser } from "@/app/contexts/UserContext"
import PasswordModal from "@/app/components/PasswordModal"
import { useDashboardSwitch } from "@/app/hooks/useDashboardSwitch"

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Documents', href: '/admin/documents', icon: FileText },
  { name: 'Categories', href: '/admin/categories', icon: FolderOpen },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Roles', href: '/admin/roles', icon: Shield },
  { name: 'Audit Logs', href: '/admin/audit-logs', icon: Activity },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, isLoading } = useUser()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const { switchDashboard, isLoading: isSwitching } = useDashboardSwitch()

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleSwitchToUser = async () => {
    setShowPasswordModal(true)
  }

  const handlePasswordVerify = async (password: string) => {
    return await switchDashboard(password, 'user')
  }

  return (
    <AuthGuard requiredPermissions={['admin_access']} fallbackPath="/">
      <div className="flex h-screen w-full bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="flex items-center justify-between h-20 px-6 border-b bg-white">
            <div className="flex items-center space-x-2">
              <FileText className="h-8 w-8" />
              <span className="text-xl font-bold text-gray-900">DocuMind AI</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Sidebar navigation */}
          <nav className="flex-1 px-4 py-8 bg-white">
            <div className="space-y-3">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-gray-100 text-gray-900 border-r-2 border-gray-300 shadow-sm'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className={`mr-4 h-5 w-5 ${
                      isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-500'
                    }`} />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </nav>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top navigation */}
        <header className="sticky top-0 z-30 bg-white shadow-sm border-b">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden mr-2"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-5 w-5" />
                <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs">
                  3
                </Badge>
              </Button>

              {/* User menu */}
              <div className="relative">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center space-x-2">
                      {/* Custom div for avatar initials */}
                      <div className="cursor-pointer h-8 w-8 border-2 border-gray-200 rounded-full bg-[#2C2C2C] flex items-center justify-center text-white font-bold text-sm">
                        {isLoading ? "..." : user?.name ? getUserInitials(user.name) : "AD"}
                      </div>
                      <span className="hidden md:block text-sm font-medium">
                        {isLoading ? "Loading..." : user?.name || "Admin User"}
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <User className="mr-2 h-4 w-4" />
                      Edit Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    {user?.permissions.includes('user_page_access') && (
                      <DropdownMenuItem onClick={handleSwitchToUser}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Switch to User Dashboard
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-red-600" onClick={logout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
          {children}
        </main>

        {/* Password Modal */}
        <PasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onVerify={handlePasswordVerify}
          dashboardType="user"
          isLoading={isSwitching}
        />
      </div>
    </div>
    </AuthGuard>
  )
}
