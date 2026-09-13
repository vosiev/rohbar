import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { commonMessages } from "@/lib/messages/common";
import { TelegramRuntime } from "@/components/telegram-runtime";

export const metadata: Metadata = { title: commonMessages.title.ru, description: commonMessages.description.ru };
export default function RootLayout({ children }:{children:React.ReactNode}){return <html lang="ru" suppressHydrationWarning><body><Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive"/><TelegramRuntime/><AppShell>{children}</AppShell></body></html>}
