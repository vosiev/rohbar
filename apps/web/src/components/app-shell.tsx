"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Boxes, Home, Menu, Plus, Search, Truck, UserRound, X, LogOut, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { I18nProvider, useI18n } from "@/lib/i18n-context";
import { api } from "@/lib/api";
import { roleLabel, setStoredRole } from "@/lib/session";
import type { Role, User } from "@/types";

const publicPaths = new Set(["/", "/login", "/register"]);

function canAccess(path: string, role: Role) {
  if (path === "/fleet" || path.startsWith("/fleet/")) return role === "carrier" || role === "admin";
  if (path.startsWith("/carrier")) return role === "carrier" || role === "admin";
  if (path === "/shipments/new") return role === "customer" || role === "admin";
  if (path.startsWith("/driver")) return role === "driver" || role === "admin";
  if (path.startsWith("/admin")) return role === "admin";
  return true;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const { text, locale, setLocale } = useI18n();

  useEffect(() => {
    let active = true;
    if (publicPaths.has(path)) {
      if (path === "/") {
        void api.auth.me().then(result => {
          if (!active || result.error) return;
          setUser(result.data);
          setStoredRole(result.data.role);
        });
      }
      return () => { active = false; };
    }
    void api.auth.me().then(result => {
      if (!active) return;
      if (result.error) {
        setUser(null);
        router.replace(`/login?next=${encodeURIComponent(path)}`);
        return;
      }
      setUser(result.data);
      setStoredRole(result.data.role);
      if (!canAccess(path, result.data.role)) {
        router.replace("/dashboard");
        return;
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [path, router]);

  const links = [
    { href: "/dashboard", icon: Home, label: text("home") },
    { href: "/shipments", icon: Search, label: text("shipments") },
    ...(user?.role === "customer" || user?.role === "admin" ? [{ href: "/shipments/new", icon: Plus, label: text("create") }] : []),
    ...(user?.role === "carrier" || user?.role === "admin" ? [{ href: "/fleet", icon: Truck, label: text("fleet") }] : []),
    { href: "/profile", icon: UserRound, label: text("profile") },
  ];

  async function logout() {
    await api.auth.logout();
    setUser(null);
    setStoredRole("customer");
    router.replace("/login");
  }

  if (!publicPaths.has(path) && !ready) return <div className="min-h-screen grid place-items-center bg-slate-50"><div className="text-sm font-semibold text-slate-500">Проверка сессии…</div></div>;

  return <div className="min-h-screen"><header className="glass sticky top-0 z-40 border-b border-gray-200/80"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tight"><span className="grid size-9 place-items-center rounded-xl bg-teal-700 text-white">R</span>{text("brand")}</Link><div className="hidden items-center gap-2 md:flex">{user ? <><span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold">{roleLabel(user.role)}</span><Link href="/notifications" className="grid size-10 place-items-center rounded-full bg-gray-100"><Bell size={18}/></Link><button onClick={logout} className="grid size-10 place-items-center rounded-full bg-gray-100" aria-label="Выйти"><LogOut size={18}/></button></> : <Link href="/login" className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white">{text("login")}</Link>}<button onClick={()=>setLocale(locale==="ru"?"tg":"ru")} className="rounded-xl border px-3 py-2 text-sm font-semibold">{locale.toUpperCase()}</button></div><button className="md:hidden" onClick={()=>setOpen(!open)} aria-label="Menu">{open?<X/>:<Menu/>}</button></div></header>{user&&<div className="mx-auto flex max-w-7xl"><aside className={`fixed inset-y-16 left-0 z-30 w-72 border-r bg-white p-4 transition-transform md:sticky md:top-16 md:block md:h-[calc(100vh-4rem)] md:translate-x-0 ${open?"translate-x-0":"-translate-x-full"}`}><nav className="space-y-1">{links.map(({href,icon:Icon,label})=><Link key={href} href={href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${path===href?"bg-teal-50 text-teal-800":"text-gray-600 hover:bg-gray-50"}`}><Icon size={19}/>{label}</Link>)}</nav><div className="mt-6 border-t pt-5"><Link href="/notifications" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600"><Bell size={19}/>{text("notifications")}</Link><Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600"><Boxes size={19}/>{text("settings")}</Link>{user.role==="admin"&&<Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600"><Shield size={19}/>{text("settings")} · Admin</Link>}<button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"><LogOut size={19}/>Выйти</button></div></aside><main className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8">{children}</main></div>}{!user&&publicPaths.has(path)&&children}{user&&<nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-2 py-2 backdrop-blur md:hidden safe-bottom"><div className="grid grid-cols-5">{links.map(({href,icon:Icon,label})=><Link key={href} href={href} className={`flex flex-col items-center gap-1 py-1 text-[11px] ${path===href?"text-teal-700":"text-gray-500"}`}><Icon size={20}/><span>{label}</span></Link>)}</div></nav>}</div>;
}

export function AppShell({ children }: { children: React.ReactNode }) { return <I18nProvider><Shell>{children}</Shell></I18nProvider>; }
