import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Option Max Pain - Options Max Pain Calculator & Delta Management',
  description: 'Calculate max pain strike prices and visualize delta management hedging pressure for stocks and crypto options. Free options max pain calculator with real-time data.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

