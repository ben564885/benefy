import type { Metadata } from "next";
import { Geist, Geist_Mono, Dosis } from "next/font/google";
import DevToolsMenuTransition from "@/components/DevToolsMenuTransition";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Rounded display sans used for the benefits results (program names + dollar figures).
const dosis = Dosis({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Benefy — SF Benefits Screening",
  description:
    "Self-serve benefits screening for San Francisco residents: deterministic eligibility, Gradient AI-guided intake, and pre-filled applications.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${dosis.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-slate-900" suppressHydrationWarning>
        {children}
        <DevToolsMenuTransition />
      </body>
    </html>
  );
}
