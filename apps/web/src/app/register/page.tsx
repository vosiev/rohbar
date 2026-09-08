"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Truck, UserRound } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { setStoredRole } from "@/lib/session";
import type { Role } from "@/types";

const roles = [
  { id: "customer" as const, title: "Заказчик", description: "Создавайте заявки и выбирайте перевозчиков.", icon: BriefcaseBusiness },
  { id: "carrier" as const, title: "Перевозчик", description: "Находите загрузки и управляйте автопарком.", icon: Truck },
  { id: "driver" as const, title: "Водитель", description: "Получайте назначенные рейсы и управляйте поездками.", icon: UserRound },
] satisfies Array<{ id: Exclude<Role, "admin">; title: string; description: string; icon: typeof BriefcaseBusiness }>;

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Exclude<Role, "admin">>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    const result = await api.auth.register({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      phone: phone.trim() || undefined,
    });

    if (result.error || !result.data) {
      setError(result.error?.message || "Не удалось создать аккаунт. Проверьте данные и попробуйте снова.");
      setBusy(false);
      return;
    }

    setStoredRole(result.data.role);
    router.replace(result.data.role === "carrier" ? "/fleet" : "/dashboard");
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-7rem)] max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 text-center">
        <p className="text-xs font-black uppercase tracking-[.18em] text-teal-700">RohBar</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Создать аккаунт</h1>
        <p className="mt-2 text-sm text-slate-500">Выберите роль, с которой вы будете работать в RohBar.</p>
      </div>

      <form onSubmit={submit} noValidate>
        <div className="grid gap-3 md:grid-cols-3">
          {roles.map(({ id, title, description, icon: Icon }) => (
            <button type="button" key={id} onClick={() => setRole(id)} className={`rounded-2xl border p-4 text-left transition ${role === id ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <Icon size={22} className="text-teal-700" />
              <div className="mt-4 font-black">{title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
            </button>
          ))}
        </div>

        <Card className="mt-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Имя" required>
              <input className={inputClass} required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ваше имя" />
            </Field>
            <Field label="Email" required>
              <input className={inputClass} required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
            </Field>
            <Field label="Телефон">
              <input className={inputClass} type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 900 000-00-00" />
            </Field>
            <Field label="Пароль" required>
              <input className={inputClass} required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Минимум 12 символов" />
            </Field>
          </div>

          {error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

          <Button type="submit" disabled={busy || name.trim().length < 2 || !email.trim() || password.length < 12} className="mt-6 w-full sm:w-auto">
            {busy ? "Создание…" : "Создать аккаунт"}
            {!busy ? <ArrowRight size={17} /> : null}
          </Button>
        </Card>
      </form>
    </main>
  );
}
