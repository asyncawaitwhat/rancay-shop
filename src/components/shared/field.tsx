"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** Labelled form field with optional inline validation error. */
export function Field({
  label,
  error,
  children,
  required,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ms-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
