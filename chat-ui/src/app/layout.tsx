import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Guesty Workflow Builder',
  description: 'AI-powered n8n workflow builder — describe your automation and get workflow JSON instantly.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="bg-warm-50 text-gray-900 antialiased font-sans">{children}</body>
    </html>
  );
}
