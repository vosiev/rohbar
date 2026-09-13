"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Truck, UserRound } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { accountMessages } from "@/lib/messages/account";
import { formatError } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { useMessages } from "@/lib/i18n-context";
import { setStoredRole } from "@/lib/session";
import type { Role } from "@/types";

type RegistrationRole = Exclude<Role, "admin">;

export default function RegisterPage() {
  const { m, locale } = useMessages(accountMessages);
  const roles: Array<{
    id: RegistrationRole;
    title: string;
    description: string;
    icon: typeof BriefcaseBusiness;
  }> = [
    {
      id: "customer",
      title: m("customer"),
      description: m("customerDescription"),
      icon: BriefcaseBusiness,
    },
    {
      id: "carrier",
      title: m("carrier"),
      description: m("carrierDescription"),
      icon: Truck,
    },
    {
      id: "driver",
      title: m("driver"),
      description: m("driverDescription"),
      icon: UserRound,
    },
  ];

  const router = useRouter();
  const [role, setRole] = useState<RegistrationRole>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | keyof typeof accountMessages | "">("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 15) {
      setError("passwordTooShort");
      return;
    }
    setBusy(true);
    const result = await api.auth.register({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      phone: phone.trim() || undefined,
    });
    if (result.error) {
      setError(result.error);
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
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">{m("createAccount")}</h1>
        <p className="mt-2 text-sm text-slate-500">{m("chooseRole")}</p>
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
            <Field label={m("name")} required>
              <input
                className={inputClass}
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={m("yourName")}
              />
            </Field>
            <Field label={m("email")} required>
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
            <Field label={m("phone")}>
              <input
                className={inputClass}
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+7 900 000-00-00"
              />
            </Field>
            <Field label={m("password")} required>
              <input
                className={inputClass}
                required
                minLength={15}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={m("minPassword")}
                aria-describedby="password-help"
              />
              <p id="password-help" className="mt-2 text-xs leading-5 text-slate-500">
                {m("passwordHelp")}
              </p>
            </Field>
          </div>

          {error && (
            <p role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {typeof error === "string" ? m(error) : formatError(error, locale)}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button type="submit" disabled={busy}>
              {busy ? m("creating") : m("createAccount")}<ArrowRight size={17} />
            </Button>
            <Link href="/login" className="text-center text-sm font-bold text-teal-700">
              {m("hasAccount")}
            </Link>
          </div>
        </Card>
      </form>
    </main>
  );
}
