"use client";

import { useEffect, useState } from "react";

type TelegramWebApp = { ready:()=>void; expand:()=>void; close:()=>void; initData:string; initDataUnsafe:{user?:{id:number;first_name:string;last_name?:string;username?:string}}; themeParams:Record<string,string>; colorScheme:"light"|"dark"; MainButton:{show:()=>void;hide:()=>void;setText:(text:string)=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void}; BackButton:{show:()=>void;hide:()=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void}; HapticFeedback:{impactOccurred:(style:string)=>void} };

declare global { interface Window { Telegram?:{WebApp:TelegramWebApp} } }
export function useTelegram(){ const [app,setApp]=useState<TelegramWebApp|null>(null); useEffect(()=>{const tg=window.Telegram?.WebApp;if(!tg)return;tg.ready();tg.expand();setApp(tg)},[]);return {app,isTelegram:Boolean(app),initData:app?.initData||"",user:app?.initDataUnsafe.user}; }
