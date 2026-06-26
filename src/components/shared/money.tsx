"use client";

import { formatMoney } from "@/lib/utils";
import { useLang } from "@/components/providers/language-provider";
import { useBrand } from "@/hooks/use-brand";

/** Display a money amount with the configured currency label. */
export function Money({ value, className }: { value: number | undefined | null; className?: string }) {
  const { lang, t } = useLang();
  const brand = useBrand();
  const cur =
    (lang === "ar" ? brand?.currencyArabic : brand?.currencyEnglish) || t("common.currency");
  return (
    <span className={className}>
      {formatMoney(value)} <span className="text-xs text-muted-foreground">{cur}</span>
    </span>
  );
}

export function useCurrency() {
  const { lang, t } = useLang();
  const brand = useBrand();
  return (lang === "ar" ? brand?.currencyArabic : brand?.currencyEnglish) || t("common.currency");
}
