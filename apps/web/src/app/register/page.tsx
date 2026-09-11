"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Truck, UserRound } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { setStoredRole } from "@/lib/session";
import type { Role } from "@/types";

type RegistrationRole = Exclude<Role, "admin">;

const roles: Array<{
  id: RegistrationRole;
  title: string;
  description: string;
  icon: typeof BriefcaseBusiness;
}> = [
  {
    id: "customer",
    title: "Заказчик",
    description: "Создавайте заявки и выбирайте перевозчиков.",
    icon: BriefcaseBusiness,
  },
  {
    id: "carrier",
    title: "Перевозчик",
    description: "Находите загрузки и управляйте автопарком.",
    icon: Truck,
  },
  {
    id: "driver",
    title: "Водитель",
    description: "Получайте назначенные рейсы и управляйте поездками.",
    icon: UserRound,
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<RegistrationRole>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await api.auth.register({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      phone: phone.trim() || undefined,
    });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    setStoredRole(result.data.role);
    router.replace(
      result.data.role === "carrier"
        ? "/fleet"
        : result.data.role === "driver"
          ? "/driver"
          : "/dashboard",
    );
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-7rem)] max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 text-center">
        <p className="text-xs font-black uppercase tracking-[.18em] text-teal-700">RohBar</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Создать аккаунт</h1>
        <p className="mt-2 text-sm text-slate-500">Выберите роль, с которой вы будете работать в RohBar.</p>
      </div>
      <form onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-3">
          {roles.map(({ id, title, description, icon: Icon }) => (
            <button
              type="button"
              key={id}
              onClick={() => setRole(id)}
              className={`rounded-2xl border p-4 text-left transition ${
                role === id
                  ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <Icon size={22} className="text-teal-700" />
              <div className="mt-4 font-black">{title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
            </button>
          ))}
        </div>

        <Card className="mt-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Имя" required>
              <input
                className={inputClass}
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ваше имя"
              />
            </Field>
            <Field label="Email" required>
              <input
                className={inputClass}
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.ru"
              />
            </Field>
            <Field label="Телефон">
              <input
                className={inputClass}
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+7 900 000-00-00"
              />
            </Field>
            <Field label="Пароль" required>
              <input
                className={inputClass}
                required
                minLength={15}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Минимум 15 символов"
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button type="submit" disabled={busy || password.length < 15}>
              {busy ? "Создание…" : "Создать аккаунт"}<ArrowRight size={17} />
            </Button>
            <Link href="/login" className="text-center text-sm font-bold text-teal-700">
              Уже есть аккаунт? Войти
            </Link>
          </div>
        </Card>
      </form>
    </main>
  );
}
