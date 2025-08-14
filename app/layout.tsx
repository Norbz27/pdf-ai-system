import type { Metadata } from 'next'
import './globals.css'
import { UserProvider } from './contexts/UserContext'
import { Toaster } from '@/components/ui/toaster'

export const metadata: Metadata = {
  title: 'DocuMind AI',
  description: 'AI-powered PDF processing system',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"></link>
        <link rel="preconnect" href="https://fonts.gstatic.com"></link>
        <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Raleway:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet"></link>
      </head>
      <body>
        <UserProvider>
          {children}
        </UserProvider>
        <Toaster />
      </body>
    </html>
  )
}
