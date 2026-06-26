"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

export default function Home() {
  const router = useRouter();
  const { loading, user, configured } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!configured || !user) router.replace("/login");
    else router.replace("/dashboard");
  }, [loading, user, configured, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
