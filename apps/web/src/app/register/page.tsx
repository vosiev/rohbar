"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Truck, UserRound, ArrowRight } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { setStoredRole } from "@/lib/session";
import type { Role } from "@/types";

const roles = [
  { id: "customer" as Role, title: "Заказчик", description: "Создавайте заявки и выбирайте перевозчиков.", icon: BriefcaseBusiness },
  { id: "carrier" as Role, title: "Перевозчик", description: "Находите загрузки и управляйте автопарком.", icon: Truck },
  { id: "driver" as Role, title: "Водитель", description: "Получайте назначенные рейсы и управляйте поездками.", icon: UserRound },
];

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("customer");
  const [busy, setBusy] = useState(false);
  function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setStoredRole(role); window.setTimeout(() => router.push(role === "carrier" ? "/fleet" : "/dashboard"), 300); }
  return <main className="mx-auto min-h-[calc(100vh-7rem)] max-w-3xl px-4 py-8 sm:px-6 sm:py-12"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.18em] text-teal-700">RohBar</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Создать аккаунт</h1><p className="mt-2 text-sm text-slate-500">Выберите роль, с которой вы будете работать в RohBar.</p></div><form onSubmit={submit}><div className="grid gap-3 md:grid-cols-3">{roles.map(({ id, title, description, icon: Icon }) => <button type="button" key={id} onClick={() => setRole(id)} className={`rounded-2xl border p-4 text-left transition ${role === id ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-white hover:border-slate-300"}`}><Icon size={22} className="text-teal-700"/><div className="mt-4 font-black">{title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{description}</div></button>)}</div><Card className="mt-5"><div className="grid gap-5 sm:grid-cols-2"><Field label="Имя" required><input className={inputClass} required placeholder="Ваше имя"/></Field><Field label="Телефон" required><input className={inputClass} required type="tel" placeholder="+7 900 000-00-00"/></Field><Field label="Пароль" required><input className={inputClass} required minLength={8} type="password" placeholder="Минимум 8 символов"/></Field></div><Button type="submit" className="mt-6 w-full sm:w-auto">{busy ? "Создание…" : "Создать аккаунт"}<ArrowRight size={17}/></Button></Card></form></main>;
}
