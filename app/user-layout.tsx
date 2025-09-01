"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { FileText, User, LogOut, Settings, LayoutDashboard } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useUser } from "./contexts/UserContext"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import PasswordModal from "@/app/components/PasswordModal"
import ProfileModal from "@/app/components/ProfileModal"
import SettingsModal from "@/app/components/SettingsModal"
import { useDashboardSwitch } from "@/app/hooks/useDashboardSwitch"

interface UserLayoutProps {
  children: React.ReactNode
}

const navigation = [
  { name: 'AI Chat', href: '/chat', active: true },
  { name: 'Documents', href: '/documents', active: false },
  { name: 'Upload', href: '/upload', active: false },
]

export default function UserLayout({ children }: UserLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, isLoading } = useUser()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const { switchDashboard, isLoading: isSwitching } = useDashboardSwitch()

  // Function to get user initials
  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleSwitchToAdmin = async () => {
    setShowPasswordModal(true)
  }

  const handlePasswordVerify = async (password: string) => {
    return await switchDashboard(password, 'admin')
  }

  const handleOpenProfile = () => {
    setShowProfileModal(true)
  }

  const handleOpenSettings = () => {
    setShowSettingsModal(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="mr-9">
                <FileText className="h-8 w-8 text-dark-600" />
                <span className="text-2xl font-bold text-gray-900">DocuMind AI</span>
              </div>
              <nav className="hidden md:flex space-x-6 ml-8">
                {navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`font-medium transition-colors ${
                        isActive
                          ? 'text-gray-900 border-b-2 border-[#2C2C2C] pb-1'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="cursor-pointer h-10 w-10 border-2 border-gray-200 rounded-full bg-[#2C2C2C] flex items-center justify-center text-white font-bold text-sm">
                    {isLoading ? "..." : user?.name ? getUserInitials(user.name) : "NB"}
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleOpenProfile}>
                    <User className="mr-2 h-4 w-4" />
                    Edit Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenSettings}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  {user?.permissions.includes('admin_access') && (
                    <DropdownMenuItem onClick={handleSwitchToAdmin}>
                      <LayoutDashboard className="mr-2 h-4 w-4" />  
                      Switch to Admin Dashboard
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Modals */}
      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onVerify={handlePasswordVerify}
        dashboardType="admin"
        isLoading={isSwitching}
      />
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  )
}
