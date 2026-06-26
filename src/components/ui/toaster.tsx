"use client";

import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useToast, dismiss } from "./use-toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts } = useToast();
  return (
    <div className="fixed bottom-4 end-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const Icon =
          t.variant === "success"
            ? CheckCircle2
            : t.variant === "destructive"
              ? AlertCircle
              : Info;
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg animate-in slide-in-from-bottom-2",
              t.variant === "destructive" && "border-destructive/40",
              t.variant === "success" && "border-green-500/40"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                t.variant === "success" && "text-green-600",
                t.variant === "destructive" && "text-destructive",
                (!t.variant || t.variant === "default") && "text-blue-600"
              )}
            />
            <div className="flex-1">
              {t.title && <div className="text-sm font-semibold">{t.title}</div>}
              {t.description && (
                <div className="text-sm text-muted-foreground">{t.description}</div>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
