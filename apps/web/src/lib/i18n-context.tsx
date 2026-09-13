"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Locale } from "@/types";
import { dictionary, message, type MessageCatalog } from "@/lib/i18n";
import { subscribeValidation } from "@/lib/validation";
import { commonMessages } from "@/lib/messages/common";

type I18n = { locale: Locale; setLocale: (locale: Locale) => void; text: (key: keyof typeof dictionary.ru) => string };
const Context = createContext<I18n | null>(null);
const storageKey = "rohbar-locale";
let currentLocale: Locale = "ru";
let localeLoaded = false;
const getLocale = (): Locale => {
  if (localeLoaded) return currentLocale;
  localeLoaded = true;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === "ru" || value === "tg") currentLocale = value;
  } catch { /* Locale switching still works when browser storage is unavailable. */ }
  return currentLocale;
};
const subscribeLocale = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      localeLoaded = true;
      currentLocale = event.newValue === "tg" ? "tg" : "ru";
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("rohbar-locale-change", listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("rohbar-locale-change", listener);
  };
};
function setLocale(locale: Locale) {
  localeLoaded = true;
  currentLocale = locale;
  try { window.localStorage.setItem(storageKey, locale); } catch { /* Keep the in-memory preference. */ }
  window.dispatchEvent(new Event("rohbar-locale-change"));
}
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => "ru" as Locale);
  const invalidControls = useRef(new Set<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>());
  useEffect(() => subscribeValidation(locale, invalidControls.current), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = commonMessages.title[locale];
    document.querySelector('meta[name="description"]')?.setAttribute("content", commonMessages.description[locale]);
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, text: (key: keyof typeof dictionary.ru) => dictionary[locale][key] }), [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const context = useContext(Context);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

/** Extend the existing locale context with a typed, complete RU/TG catalog. */
export function useMessages<C extends MessageCatalog>(catalog: C) {
  const context = useI18n();
  const m = useCallback((key: keyof C, params?: Record<string, string | number>) => message(catalog, context.locale, key, params), [catalog, context.locale]);
  return { ...context, m };
}
