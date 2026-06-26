"use client";

import { Loader2, Inbox, AlertTriangle, Lock } from "lucide-react";
import { useLang } from "@/components/providers/language-provider";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="mt-3 text-sm">{label || t("common.loading")}</p>
    </div>
  );
}

export function EmptyState({ title, hint }: { title?: string; hint?: string }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
      <Inbox className="h-10 w-10" />
      <p className="mt-3 font-medium text-foreground">{title || t("common.noData")}</p>
      {hint && <p className="mt-1 text-sm">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <p className="mt-3 font-medium">{message || t("msg.error")}</p>
    </div>
  );
}

export function NoAccess() {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
      <Lock className="h-10 w-10" />
      <p className="mt-3 font-medium text-foreground">{t("msg.noPermission")}</p>
    </div>
  );
}
