"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { dictionaries, type Lang } from "@/lib/i18n/dictionary";

interface LanguageContextValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Pick the right localized name based on current language. */
  name: (en?: string, ar?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "csms.lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = (typeof window !== "undefined" &&
      localStorage.getItem(STORAGE_KEY)) as Lang | null;
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "ar" ? "en" : "ar");
  }, [lang, setLang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`{${k}}`, "g"), String(v));
        }
      }
      return str;
    },
    [lang]
  );

  const name = useCallback(
    (en?: string, ar?: string) => {
      if (lang === "ar") return ar || en || "";
      return en || ar || "";
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, toggleLang, t, name }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
