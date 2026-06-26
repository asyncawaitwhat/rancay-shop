import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/providers";

export const metadata: Metadata = {
  title: "Clothes Store Management System",
  description: "Bilingual admin system for managing an online clothing store.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
