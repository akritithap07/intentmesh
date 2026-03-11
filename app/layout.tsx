import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper';
import { GlobalCursor } from '@/components/GlobalCursor';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'IntentMesh',
  description: 'AI-powered project onboarding',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <SessionProviderWrapper>
          <GlobalCursor />
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}