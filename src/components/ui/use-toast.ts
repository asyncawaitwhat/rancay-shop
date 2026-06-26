"use client";

// Lightweight toast store (inspired by shadcn/ui). Components subscribe via
// useToast(); call toast({...}) from anywhere.
import * as React from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToasterToast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

const listeners: Array<(toasts: ToasterToast[]) => void> = [];
let memory: ToasterToast[] = [];
let counter = 0;

function emit() {
  listeners.forEach((l) => l(memory));
}

export function toast(t: Omit<ToasterToast, "id">) {
  const id = `t${++counter}`;
  memory = [...memory, { id, ...t }];
  emit();
  setTimeout(() => dismiss(id), 4000);
  return id;
}

export function dismiss(id: string) {
  memory = memory.filter((t) => t.id !== id);
  emit();
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToasterToast[]>(memory);
  React.useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const i = listeners.indexOf(setToasts);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);
  return { toasts, toast, dismiss };
}
