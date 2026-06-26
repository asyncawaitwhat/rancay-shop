"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileToBase64, validateImageFile, cn } from "@/lib/utils";
import { useLang } from "@/components/providers/language-provider";

/**
 * Reusable Base64 image uploader. Validates type/size, converts to a Base64
 * data URL, previews it, and reports the string up via onChange. NEVER uploads
 * to Firebase Storage — the Base64 string is saved directly in the Firestore doc.
 */
export function ImageUpload({
  value,
  onChange,
  className,
  rounded = false,
}: {
  value?: string;
  onChange: (base64: string) => void;
  className?: string;
  rounded?: boolean;
}) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const err = validateImageFile(file);
    if (err) {
      setError(err);
      return;
    }
    const base64 = await fileToBase64(file);
    onChange(base64);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-24 w-24 items-center justify-center overflow-hidden border bg-muted/40",
            rounded ? "rounded-full" : "rounded-lg"
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={t("image.preview")} className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {value ? <RefreshCw className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
            {value ? t("image.replace") : t("image.choose")}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              <Trash2 className="h-4 w-4" />
              {t("image.remove")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground max-w-[12rem]">{t("image.hint")}</p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
