"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, Navigation, Phone, Truck } from "lucide-react";
import { useState } from "react";
import { Button, Card, PageHeader, StatCard, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { createAutomationEvent, dispatchAutomation } from "@/lib/automation";

const initialTrips=[
 {id:"RH-10482",route:"Москва → Казань",cargo:"Строительные материалы · 20 т",status:"in_transit" as const,time:"Сегодня · прибытие до 18:00"},
 {id:"RH-10479",route:"Санкт-Петербург → Москва",cargo:"Оборудование · 12 т",status:"accepted" as const,time:"11 сентября · 08:00"},
];

export default function DriverDashboard(){
 const [trips,setTrips]=useState(initialTrips);
 const [busy,setBusy]=useState<string|null>(null);
 async function updateStatus(id:string,status:"in_transit"|"delivered"){
  setBusy(id);
  const result=await api.shipments.status(id,status);
  if(!result.error){
   setTrips(current=>current.map(trip=>trip.id===id?{...trip,status}:trip));
   const event=createAutomationEvent("shipment.status_changed",id,"usr_driver_001",{status});
   await dispatchAutomation(event).catch(()=>undefined);
  }
  setBusy(null);
 }
 return <div className="mx-auto max-w-7xl">
  <PageHeader eyebrow="RohBar · водитель" title="Мои рейсы" description="Контролируйте назначенные перевозки и быстро обновляйте их статус." action={<Button href="/shipments">Все перевозки <ArrowRight size={17}/></Button>}/>
  <div className="grid gap-4 sm:grid-cols-3"><StatCard icon={Navigation} label="Активный рейс" value={String(trips.filter(x=>x.status==="in_transit").length)}/><StatCard icon={Truck} label="Всего рейсов" value="18"/><StatCard icon={MapPin} label="Сегодня" value="Москва → Казань"/></div>
  <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
   <Card><div><h2 className="text-lg font-black">Назначенные рейсы</h2><p className="mt-1 text-sm text-slate-500">Актуальное состояние перевозок</p></div><div className="mt-5 space-y-4">{trips.map(t=><article key={t.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold text-slate-400">{t.id}</p><h3 className="mt-1 text-lg font-black">{t.route}</h3><p className="mt-2 text-sm text-slate-500">{t.cargo}</p><p className="mt-3 text-sm font-semibold text-slate-600">{t.time}</p></div><StatusBadge status={t.status}/></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button href={`/shipments/${t.id}`}>Открыть рейс</Button>{t.status==="accepted"&&<Button disabled={busy===t.id} onClick={()=>updateStatus(t.id,"in_transit")}>{busy===t.id?"Обновление…":"Начать рейс"}</Button>}{t.status==="in_transit"&&<Button disabled={busy===t.id} onClick={()=>updateStatus(t.id,"delivered")}>{busy===t.id?"Обновление…":"Отметить доставленным"}</Button>}<Button variant="secondary" href="/notifications">Уведомления</Button></div>{t.status==="delivered"&&<div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 size={17}/>Доставка подтверждена</div>}</article>)}</div></Card>
   <Card><h2 className="text-lg font-black">Контакт диспетчера</h2><p className="mt-2 text-sm text-slate-500">По вопросам рейса RH-10482</p><div className="mt-5 rounded-2xl bg-slate-50 p-4"><p className="font-black">Алексей Морозов</p><p className="mt-1 text-sm text-slate-500">Диспетчер · RohBar</p><a href="tel:+79000000000" className="mt-4 inline-flex items-center gap-2 font-bold text-teal-700"><Phone size={17}/>Позвонить диспетчеру</a></div><Link href="/profile" className="mt-5 inline-flex text-sm font-bold text-slate-600">Мой профиль <ArrowRight size={15} className="ml-1"/></Link></Card>
  </div>
 </div>
}
