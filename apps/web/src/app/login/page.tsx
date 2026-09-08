"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { setStoredRole } from "@/lib/session";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    const result = await api.auth.login(email.trim(), password);
    if (result.error || !result.data) {
      setError(result.error?.message || "Не удалось войти. Проверьте данные и попробуйте снова.");
      setBusy(false);
      return;
    }

    setStoredRole(result.data.role);
    router.replace(result.data.role === "carrier" ? "/fleet" : "/dashboard");
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-700 text-xl font-black text-white">R</span>
          <h1 className="mt-5 text-2xl font-black">Вход в RohBar</h1>
          <p className="mt-2 text-sm text-slate-500">Управляйте перевозками из одного кабинета.</p>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
          <Field label="Email" required>
            <input className={inputClass} required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Пароль" required>
            <input type="password" className={inputClass} required minLength={12} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Минимум 12 символов" />
          </Field>

          {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={busy || !email.trim() || password.length < 12}>
            {busy ? "Вход…" : "Войти"}
            {!busy ? <ArrowRight size={17} /> : null}
          </Button>
        </form>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
          <ShieldCheck size={17} className="mr-2 inline text-teal-700" />
          Сессия хранится в защищённой HttpOnly cookie и подтверждается backend.
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Нет аккаунта? <Link href="/register" className="font-bold text-teal-700">Зарегистрироваться</Link>
        </p>
      </Card>
    </main>
  );
}
