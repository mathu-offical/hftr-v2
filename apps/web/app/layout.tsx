import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'hftr',
  description: 'Build trading companies. AI never touches your numbers — or your clocks.',
};

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
  return clerkConfigured ? <ClerkProvider>{body}</ClerkProvider> : body;
}
