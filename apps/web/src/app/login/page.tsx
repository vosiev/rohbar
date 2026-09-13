"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { accountMessages } from "@/lib/messages/account";
import { formatError } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { useMessages } from "@/lib/i18n-context";
import { setStoredRole } from "@/lib/session";

export default function LoginPage() {
  const { m, locale } = useMessages(accountMessages);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string>("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await api.auth.login(email.trim(), password);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setStoredRole(result.data.role);
    router.replace(result.data.role === "carrier" ? "/fleet" : result.data.role === "driver" ? "/driver" : result.data.role === "admin" ? "/dashboard" : "/dashboard");
  }

  return <main className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-10"><Card className="w-full max-w-md"><div className="text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-700 text-xl font-black text-white">R</span><h1 className="mt-5 text-2xl font-black">{m("loginTitle")}</h1><p className="mt-2 text-sm text-slate-500">{m("loginDescription")}</p></div><form onSubmit={submit} className="mt-7 space-y-5"><Field label={m("email")} required><input className={inputClass} required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.ru"/></Field><Field label={m("password")} required><input type="password" className={inputClass} required minLength={8} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder={m("enterPassword")} /></Field>{error&&<p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{formatError(error, locale)}</p>}<Button type="submit" disabled={busy} className="w-full">{busy?m("loggingIn"):m("login")}<ArrowRight size={17}/></Button></form><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500"><ShieldCheck size={17} className="mr-2 inline text-teal-700"/>{m("sessionRights")}</div><p className="mt-6 text-center text-sm text-slate-500">{m("noAccount")} <Link href="/register" className="font-bold text-teal-700">{m("register")}</Link></p></Card></main>;
}
