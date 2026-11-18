import type { Metadata, Viewport } from 'next'
import { Inter, Rajdhani } from 'next/font/google'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/providers/ThemeProvider'
import './globals.css'
import '@/components/ai/ai.css'
import { AppShell } from '@/components/AppShell'
import { DemoProvider } from '@/providers/DemoProvider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Gully Cricket',
  description: 'The ultimate gully cricket scoring & stats app',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Gully Cricket',
    description: 'Score live, track stats, balance teams for gully cricket',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0f0f10' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${rajdhani.variable} font-sans antialiased`}>
        <ThemeProvider>
          <DemoProvider>
            <AppShell>{children}</AppShell>
          </DemoProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: '#1c1c1e',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
