"use client";

import { useState } from "react";
import { Bell, CheckCircle2, FileWarning, MessageSquareText } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/rohbar-ui";

const initial = [
  { id: "1", icon: Bell, title: "Новое предложение", text: "По заявке RH-10482 получено новое предложение.", time: "10 минут назад", read: false },
  { id: "2", icon: CheckCircle2, title: "Перевозка принята", text: "RH-10479 перешла в статус «Принята».", time: "1 час назад", read: true },
  { id: "3", icon: FileWarning, title: "Требуется действие", text: "Проверьте документы перевозчика перед назначением рейса.", time: "Сегодня, 08:30", read: true },
  { id: "4", icon: MessageSquareText, title: "Новое сообщение", text: "Перевозчик оставил сообщение по заявке RH-10471.", time: "Вчера", read: true },
];

export default function Notifications() {
  const [items, setItems] = useState(initial);
  const unread = items.filter((item) => !item.read).length;
  function markAll() { setItems((current) => current.map((item) => ({ ...item, read: true }))); }
  return <div className="mx-auto max-w-3xl"><PageHeader eyebrow="RohBar" title="Уведомления" description="События по заявкам, предложениям и перевозкам." action={unread ? <Button variant="secondary" onClick={markAll}>Отметить всё прочитанным</Button> : undefined}/><div className="space-y-3">{items.map((item) => { const Icon = item.icon; return <Card key={item.id} className={!item.read ? "border-teal-200 bg-teal-50/20" : ""}><div className="flex gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon size={19}/></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h2 className="font-bold">{item.title}</h2>{!item.read && <span className="mt-1 size-2.5 shrink-0 rounded-full bg-teal-600"/>}</div><p className="mt-1 text-sm leading-6 text-slate-500">{item.text}</p><p className="mt-3 text-xs font-semibold text-slate-400">{item.time}</p></div></div></Card>; })}</div></div>;
}
