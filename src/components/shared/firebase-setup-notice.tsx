"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { firebaseEnvStatus } from "@/lib/firebase/client";
import { useLang } from "@/components/providers/language-provider";

/**
 * Shown when Firebase env vars are missing. Lists exactly which NEXT_PUBLIC_*
 * variables made it into THIS build, so a deploy with missing vars is
 * self-diagnosing (the usual Cloudflare Pages gotcha).
 */
export function FirebaseSetupNotice() {
  const { t } = useLang();
  return (
    <div className="w-full max-w-lg rounded-xl border bg-background p-8 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <h1 className="text-xl font-bold">{t("setup.title")}</h1>
      </div>
      <p className="mb-4 text-muted-foreground">{t("setup.body")}</p>

      <p className="mb-2 text-sm font-medium">Variables detected in this build:</p>
      <ul className="space-y-1.5 rounded-lg bg-muted p-4 text-xs font-mono">
        {firebaseEnvStatus.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            {s.present ? (
              <Check className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <X className={`h-4 w-4 shrink-0 ${s.required ? "text-destructive" : "text-amber-500"}`} />
            )}
            <span className={s.present ? "" : s.required ? "text-destructive" : "text-amber-600"}>
              {s.key}
              {!s.present && !s.required ? " (optional)" : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        A red ✗ on a required variable means it was missing when this site was built.
        Set it in Cloudflare → Settings → Variables (Production), then trigger a NEW
        deployment and hard-refresh (Ctrl/Cmd+Shift+R).
      </p>
      <p className="mt-4 text-sm text-muted-foreground">{t("setup.readme")}</p>
    </div>
  );
}
