"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle, Info, AlertTriangle, XCircle } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  console.log('Toaster render - toasts:', toasts) // Debug log

  const getToastIcon = (variant?: "default" | "destructive" | "success" | "warning" | "info") => {
    switch (variant) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'info':
        return <Info className="h-5 w-5 text-blue-600" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'destructive':
        return <XCircle className="h-5 w-5 text-red-600" />
      default:
        return <Info className="h-5 w-5 text-gray-600" />
    }
  }

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        console.log('Rendering toast:', { id, title, description, variant }) // Debug log
        return (
          <Toast key={id} variant={variant || "default"} {...props}>
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                {getToastIcon(variant || "default")}
              </div>
              <div className="flex-1 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
