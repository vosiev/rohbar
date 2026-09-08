"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/types";
import { dictionary } from "@/lib/i18n";

type I18n = { locale:Locale; setLocale:(locale:Locale)=>void; text:(key:keyof typeof dictionary.ru)=>string };
const Context=createContext<I18n | null>(null);
export function I18nProvider({children}:{children:React.ReactNode}){ const [locale,setLocale]=useState<Locale>("ru"); useEffect(()=>{const v=localStorage.getItem("rohbar-locale"); if(v==="ru"||v==="tg")setLocale(v)},[]); const change=(v:Locale)=>{setLocale(v);localStorage.setItem("rohbar-locale",v)}; const value=useMemo(()=>({locale,setLocale:change,text:(key:keyof typeof dictionary.ru)=>dictionary[locale][key]}),[locale]); return <Context.Provider value={value}>{children}</Context.Provider> }
export function useI18n(){ const c=useContext(Context); if(!c)throw new Error("useI18n must be used inside I18nProvider"); return c; }
