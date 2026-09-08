import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { TelegramRuntime } from "@/components/telegram-runtime";

export const metadata: Metadata = { title:"RohBar — Грузоперевозки", description:"Цифровая платформа межгородских грузоперевозок по России." };
export default function RootLayout({ children }:{children:React.ReactNode}){return <html lang="ru" suppressHydrationWarning><body><TelegramRuntime/><AppShell>{children}</AppShell></body></html>}
