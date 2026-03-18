import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Document Verification PoC',
  description: 'Upload + OCR test page',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
