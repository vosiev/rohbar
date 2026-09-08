"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Search, Truck } from "lucide-react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { Shipment } from "@/types";

export default function CarrierShipmentsPage(){
 const [items,setItems]=useState<Shipment[]>([]);const [query,setQuery]=useState("");const [loading,setLoading]=useState(true);
 useEffect(()=>{api.shipments.list().then(r=>{if(r.data)setItems(r.data);setLoading(false)})},[]);
 const filtered=items.filter(x=>`${x.from} ${x.to} ${x.cargo}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="mx-auto max-w-7xl"><PageHeader eyebrow="RohBar · перевозчик" title="Доступные перевозки" description="Находите подходящие загрузки и открывайте карточку рейса для управления предложением и водителем."/><div className="mb-5 flex items-center gap-3 rounded-2xl border bg-white px-4 py-3"><Search size={19} className="text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Город, маршрут или груз" className="w-full bg-transparent outline-none"/></div>{loading?<Card>Загрузка перевозок…</Card>:filtered.length===0?<Card>Подходящих перевозок не найдено.</Card>:<div className="grid gap-4">{filtered.map(s=><Card key={s.id}><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="flex gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Truck size={22}/></div><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-slate-400">{s.id}</p><StatusBadge status={s.status}/></div><h2 className="mt-1 text-xl font-black">{s.from} → {s.to}</h2><p className="mt-2 text-sm text-slate-500">{s.cargo} · {s.weight} · {s.date}</p><p className="mt-2 font-black">{s.price}</p></div></div><Button href={`/carrier/shipments/${s.id}`}>Открыть рейс <ArrowRight size={17}/></Button></div></Card>)}</div>}</div>
}
