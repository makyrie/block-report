import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import translations, { SUPPORTED_LANGUAGES } from './translations';
import type { LanguageCode } from './translations';

interface LanguageContextValue {
  lang: LanguageCode;
  setLang: (code: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string>) => string;
  reportLang: string;
  setReportLang: (label: string) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>('en');
  const [reportLang, setReportLang] = useState('English');

  const setLang = useCallback((code: LanguageCode) => {
    setLangState(code);
    const match = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    if (match) setReportLang(match.label);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, v);
        }
      }
      return str;
    },
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, reportLang, setReportLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
