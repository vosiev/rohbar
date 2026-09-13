import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { commonMessages } from "@/lib/messages/common";
import { TelegramRuntime } from "@/components/telegram-runtime";

export const metadata: Metadata = { title: commonMessages.title.ru, description: commonMessages.description.ru };
export default function RootLayout({ children }:{children:React.ReactNode}){return <html lang="ru" suppressHydrationWarning><body><TelegramRuntime/><AppShell>{children}</AppShell></body></html>}
