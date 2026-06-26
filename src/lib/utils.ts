import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DateLike } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalise any DateLike value into a JS Date (or null). */
export function toDate(value: DateLike): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export function formatDate(value: DateLike, locale = "en-GB"): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: DateLike, locale = "en-GB"): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a money amount with two decimals and thousands separators. */
export function formatMoney(value: number | undefined | null): string {
  const n = typeof value === "number" && isFinite(value) ? value : 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatNumber(value: number | undefined | null): string {
  const n = typeof value === "number" && isFinite(value) ? value : 0;
  return n.toLocaleString("en-US");
}

/** Round to 2 decimals to avoid floating point noise in money math. */
export function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toISODateInput(value: DateLike): string {
  const d = toDate(value) ?? new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/** Convert a selected File to a Base64 data URL string. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 800 * 1024; // 800 KB before Base64 inflation

export function validateImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Invalid file type. Allowed: JPG, PNG, WEBP.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024)} KB.`;
  }
  return null;
}

/** Resolve an item/invoice discount into an absolute amount. */
export function resolveDiscount(
  base: number,
  type: "amount" | "percentage",
  value: number
): number {
  if (!value || value <= 0) return 0;
  if (type === "percentage") {
    return money((base * Math.min(value, 100)) / 100);
  }
  return money(Math.min(value, base));
}

export function arrayToCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
