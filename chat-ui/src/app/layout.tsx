import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'n8n Workflow Builder',
  description: 'AI-powered n8n workflow builder — describe your automation and get workflow JSON instantly.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-100 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
