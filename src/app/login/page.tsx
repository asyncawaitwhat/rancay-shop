"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { FirebaseSetupNotice } from "@/components/shared/firebase-setup-notice";
import { useAuth } from "@/components/providers/auth-provider";
import { useLang } from "@/components/providers/language-provider";
import { signIn, authErrorMessage } from "@/lib/firebase/auth";
import { logAudit } from "@/lib/firebase/services/auditLogs";

export default function LoginPage() {
  const { t } = useLang();
  const router = useRouter();
  const { configured, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fbUser = await signIn(email.trim(), password);
      await logAudit(
        { userId: fbUser.uid, userName: email },
        { action: "login", entityType: "auth", description: `User logged in (${email})` }
      );
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <FirebaseSetupNotice />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Store className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold">{t("auth.welcome")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@store.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
