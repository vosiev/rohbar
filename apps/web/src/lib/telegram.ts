"use client";

import { useEffect, useSyncExternalStore } from "react";

type TelegramWebApp = { ready:()=>void; expand:()=>void; close:()=>void; initData:string; initDataUnsafe:{user?:{id:number;first_name:string;last_name?:string;username?:string}}; themeParams:Record<string,string>; colorScheme:"light"|"dark"; MainButton:{show:()=>void;hide:()=>void;setText:(text:string)=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void}; BackButton:{show:()=>void;hide:()=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void}; HapticFeedback:{impactOccurred:(style:string)=>void} };

declare global { interface Window { Telegram?:{WebApp:TelegramWebApp} } }
const getTelegram=()=>window.Telegram?.WebApp??null;
const subscribeTelegram=(listener:()=>void)=>{window.addEventListener("telegram-webapp-ready",listener);return()=>window.removeEventListener("telegram-webapp-ready",listener)};
export function useTelegram(){const app=useSyncExternalStore(subscribeTelegram,getTelegram,()=>null);useEffect(()=>{app?.ready();app?.expand()},[app]);return {app,isTelegram:Boolean(app),initData:app?.initData||"",user:app?.initDataUnsafe.user};}
