import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "ja" | "en" | "vi";

type LocalizedText =
  | string
  | {
      ja?: string;
      en?: string;
      vi?: string;
      [key: string]: string | undefined;
    };

type LanguageContextValue = {
  language: Language;
  currentLanguage: Language;
  setLanguage: (language: Language) => void;
  changeLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (value: LocalizedText, fallback?: string) => string;
};

const translations: Record<Language, Record<string, string>> = {
  ja: {},
  en: {},
  vi: {},
};

const LANGUAGE_STORAGE_KEY = "manabi_language";
const defaultLanguage: Language = "ja";
const supportedLanguages: Language[] = ["ja", "en", "vi"];

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return defaultLanguage;

  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return supportedLanguages.includes(saved as Language)
    ? (saved as Language)
    : defaultLanguage;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const value = useMemo(() => {
    const t = (value: LocalizedText, fallback = ""): string => {
      if (!value) return fallback;

      if (typeof value === "string") {
        return translations[language][value] ?? value;
      }

      return (
        value[language] ??
        value.ja ??
        value.en ??
        value.vi ??
        fallback
      );
    };

    const setLanguage = (newLanguage: Language) => {
      setLanguageState(newLanguage);
    };

    const changeLanguage = (newLanguage: Language) => {
      setLanguage(newLanguage);
    };

    const toggleLanguage = () => {
      setLanguageState((prev) => (prev === "ja" ? "en" : "ja"));
    };

    return {
      language,
      currentLanguage: language,
      setLanguage,
      changeLanguage,
      toggleLanguage,
      t,
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return context;
}
