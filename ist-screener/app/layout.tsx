import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

// PRD §1.1: Application title and description
export const metadata: Metadata = {
  title: 'IST Screener — Catalyze Partners',
  description:
    'AI-powered Investment Screening Test platform for rapid evaluation of inbound deal flow',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      {/* PRD §6.1: dark class enables dark theme; monospaced font variable for numeric data */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
