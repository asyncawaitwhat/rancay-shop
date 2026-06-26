"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers/language-provider";

export function LanguageSwitcher() {
  const { lang, toggleLang } = useLang();
  return (
    <Button variant="outline" size="sm" onClick={toggleLang} title="Switch language">
      <Languages className="h-4 w-4" />
      {lang === "ar" ? "English" : "العربية"}
    </Button>
  );
}
