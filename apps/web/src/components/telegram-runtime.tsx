"use client";
import Script from "next/script";
import { useTelegram } from "@/lib/telegram";
export function TelegramRuntime(){useTelegram();return <Script src="https://telegram.org/js/telegram-web-app.js?57" strategy="afterInteractive"/>}
