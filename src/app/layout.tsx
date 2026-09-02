import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { NovaWebMcpRegistrar } from "@/webmcp/NovaWebMcpRegistrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NOVA LAB",
  description:
    "A stateful, executable scientific environment for external AI agents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-50">
        {/* NOVA WebMCP tools — External agents discover these via document.modelContext */}
        <NovaWebMcpRegistrar />
        {children}
      </body>
    </html>
  );
}
