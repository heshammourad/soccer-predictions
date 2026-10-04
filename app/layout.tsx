import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from './components/Sidebar';
import { withBasePath } from './lib/basePath';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Link previews need absolute URLs (og:image). In production they point at the public
  // portal address; elsewhere Next.js falls back to the deployment's own URL. The basePath
  // goes in by hand because Turbopack leaves it out of opengraph-image's URL (the route
  // itself is served under it).
  metadataBase:
    process.env.VERCEL_ENV === 'production'
      ? new URL(withBasePath('/'), 'https://www.heshammourad.com')
      : undefined,
  title: 'World Football ELO Rankings & Soccer Predictor',
  description: 'Real-time global national football ratings, rankings, and Monte Carlo cup tournament projections.',
  openGraph: { siteName: 'Soccer Predictor', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-slate-950 text-slate-100`}>
        <div className="min-h-screen relative flex flex-col lg:flex-row">
          {/* Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
