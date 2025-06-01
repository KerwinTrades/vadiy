import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Veteran Chat Assistant - Secure AI Support for Veterans',
  description: 'AI-powered chat assistant for U.S. military veterans. Get help with benefits, opportunities, applications, and resources. Secure, private, and built specifically for those who served.',
  keywords: ['veterans', 'military', 'benefits', 'AI assistant', 'secure chat', 'VA benefits'],
  authors: [{ name: 'Veteran Services Team' }],
  robots: 'index, follow',
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#1E3A8A',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="security-policy" content="veteran-data-protection" />
      </head>
      <body className={`${inter.className} h-full bg-gray-50 antialiased`}>
        <div className="min-h-full">
          {children}
        </div>
      </body>
    </html>
  )
} 