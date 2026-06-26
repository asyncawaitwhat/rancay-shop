"use client";

import type { ReactNode } from "react";
import { LanguageProvider } from "./language-provider";
import { AuthProvider } from "./auth-provider";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        {children}
        <Toaster />
      </AuthProvider>
    </LanguageProvider>
  );
}
