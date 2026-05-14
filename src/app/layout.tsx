import type { Metadata, Viewport } from "next"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { ToastProvider } from "@/contexts/ToastContext"
import { ToastContainer } from "@/components/ToastContainer"
import { Navigation } from "@/components/Navigation"
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar"
import "./globals.css"

export const metadata: Metadata = {
  applicationName: "Healthspan",
  title: "Healthspan",
  description: "A simple, mobile-first app to log strength training and healthspan data",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Healthspan",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#282828",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ServiceWorkerRegistrar />
        <ThemeProvider>
          <ToastProvider>
            <Navigation />
            <main className="px-4 pb-20">
              {children}
            </main>
            <ToastContainer />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
