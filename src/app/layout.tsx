import type { Metadata, Viewport } from "next";
import { Roboto, Open_Sans } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  themeColor: "#007ACC",
};

export const metadata: Metadata = {
  // Base URL for resolving relative URLs (update for production)
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://docxdiff.com"),
  
  // Primary metadata
  title: {
    default: "DocX Diff – Compare Word Documents Online | Free DOCX Comparison Tool",
    template: "%s | DocX Diff",
  },
  description: "Compare two DOCX files online and see every change instantly. DocX Diff highlights insertions, deletions, and formatting changes with tracked changes you can accept or reject. Free, fast, and 100% MS Word compatible.",
  
  // Keywords for search engines
  keywords: [
    "DOCX comparison",
    "compare Word documents",
    "Word diff tool",
    "document comparison online",
    "track changes",
    "DOCX diff",
    "compare DOCX files",
    "Word document changes",
    "free document comparison",
    "online diff tool",
  ],
  
  // Author and creator
  authors: [{ name: "Pablo Schaffner" }],
  creator: "Pablo Schaffner",
  
  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  
  // Open Graph (Facebook, LinkedIn, etc.)
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "DocX Diff",
    title: "DocX Diff – Compare Word Documents Online",
    description: "Upload two DOCX files and instantly see all differences. Accept or reject changes visually. Free, no signup required, 100% Word compatible.",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "DocX Diff - Online DOCX Comparison Tool",
      },
    ],
  },
  
  // Twitter Card
  twitter: {
    card: "summary",
    title: "DocX Diff – Compare Word Documents Online",
    description: "Upload two DOCX files and instantly see all differences. Accept or reject changes visually. Free and Word compatible.",
    images: ["/logo.png"],
  },
  
  // Favicons
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  
  // Web App Manifest
  manifest: "/favicon/site.webmanifest",
  
  // Additional metadata
  category: "Technology",
  classification: "Document Tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${openSans.variable} antialiased font-sans`}
        style={{ fontFamily: 'var(--font-open-sans), sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
