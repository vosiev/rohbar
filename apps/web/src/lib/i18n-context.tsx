"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { Locale } from "@/types";
import { dictionary } from "@/lib/i18n";

type I18n = { locale:Locale; setLocale:(locale:Locale)=>void; text:(key:keyof typeof dictionary.ru)=>string };
const Context=createContext<I18n | null>(null);
const getLocale=():Locale=>{const v=window.localStorage.getItem("rohbar-locale");return v==="ru"||v==="tg"?v:"ru"};
const subscribeLocale=(listener:()=>void)=>{window.addEventListener("storage",listener);window.addEventListener("rohbar-locale-change",listener);return()=>{window.removeEventListener("storage",listener);window.removeEventListener("rohbar-locale-change",listener)}};
export function I18nProvider({children}:{children:React.ReactNode}){const locale=useSyncExternalStore(subscribeLocale,getLocale,()=>"ru" as Locale);const change=(v:Locale)=>{window.localStorage.setItem("rohbar-locale",v);window.dispatchEvent(new Event("rohbar-locale-change"))};const value=useMemo(()=>({locale,setLocale:change,text:(key:keyof typeof dictionary.ru)=>dictionary[locale][key]}),[locale]);return <Context.Provider value={value}>{children}</Context.Provider>}
export function useI18n(){const c=useContext(Context);if(!c)throw new Error("useI18n must be used inside I18nProvider");return c;}
