import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  isLanguage,
  translate,
  type Language,
  type TranslationKey,
  type TranslationParams,
} from "../i18n";

export type { Language } from "../i18n";

type LanguageContextValue = {
  language: Language;
  currentLanguage: Language;
  setLanguage: (language: Language) => void;
  changeLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const LANGUAGE_STORAGE_KEY = "manabi_language";
const defaultLanguage: Language = "ja";

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return defaultLanguage;

  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(saved) ? saved : defaultLanguage;
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
    const t = (key: TranslationKey, params?: TranslationParams) =>
      translate(language, key, params);

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

// Hooks intentionally share this module with their provider component.
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return context;
}
