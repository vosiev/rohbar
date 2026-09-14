"use client";

import { useEffect } from "react";
import { getTelegram } from "@/lib/telegram";

export function TelegramRuntime() {
  useEffect(() => {
    const app = getTelegram();
    app?.ready();
    app?.expand();
    window.dispatchEvent(new Event("telegram-webapp-ready"));
  }, []);
  return null;
}
