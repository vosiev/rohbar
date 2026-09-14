"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";

type TelegramWebApp = { ready:()=>void; expand:()=>void; close:()=>void; initData:string; initDataUnsafe:{user?:{id:number;first_name:string;last_name?:string;username?:string}}; themeParams:Record<string,string>; colorScheme:"light"|"dark"; MainButton:{show:()=>void;hide:()=>void;setText:(text:string)=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void}; BackButton:{show:()=>void;hide:()=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void}; HapticFeedback:{impactOccurred:(style:string)=>void} };

declare global { interface Window { Telegram?:{WebApp:TelegramWebApp} } }
// The SDK is loaded before hydration; its presence alone also occurs in browsers.
export const getTelegram = () => {
  const app = window.Telegram?.WebApp;
  return app?.initData ? app : null;
};

let authentication: ReturnType<typeof api.auth.telegram> | undefined;

// A shared promise also deduplicates React Strict Mode's effect replay.
// Never persist initData or derive identity/roles from initDataUnsafe.
export function authenticateTelegramOnce() {
  const app = getTelegram();
  if (!app) return null;
  authentication ??= api.auth.telegram(app.initData);
  return authentication;
}
const subscribeTelegram=(listener:()=>void)=>{window.addEventListener("telegram-webapp-ready",listener);return()=>window.removeEventListener("telegram-webapp-ready",listener)};
export function useTelegram() {
  const app = useSyncExternalStore(subscribeTelegram, getTelegram, () => null);
  return { app, isTelegram: Boolean(app), initData: app?.initData || "" };
}
