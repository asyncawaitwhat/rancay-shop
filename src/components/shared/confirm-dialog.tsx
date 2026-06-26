"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers/language-provider";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "destructive",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("action.cancel")}
          </Button>
          <Button variant={variant} onClick={handle} disabled={loading}>
            {confirmLabel || t("action.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hook to manage a confirm dialog with an arbitrary payload. */
export function useConfirm<T = unknown>() {
  const [state, setState] = useState<{ open: boolean; payload: T | null }>({
    open: false,
    payload: null,
  });
  return {
    open: state.open,
    payload: state.payload,
    ask: (payload: T) => setState({ open: true, payload }),
    setOpen: (open: boolean) => setState((s) => ({ ...s, open })),
  };
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
