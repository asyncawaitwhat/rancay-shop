"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useAuth } from "@/components/providers/auth-provider";
import { useLang } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { FirebaseSetupNotice } from "@/components/shared/firebase-setup-notice";

export function AppShell({ children }: { children: ReactNode }) {
  const { configured, loading, user, profileError, signOut } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && configured && !user && !profileError) {
      router.replace("/login");
    }
  }, [loading, configured, user, profileError, router]);

  if (!configured) {
    return <SetupScreen />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="max-w-md text-muted-foreground">{profileError}</p>
        <Button variant="outline" onClick={() => signOut()}>
          {t("action.logout")}
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-e bg-background lg:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-64 bg-background shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <FirebaseSetupNotice />
    </div>
  );
}
