"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Field, PageHeader, ShipmentCard, inputClass } from "@/components/rohbar-ui";
import type { Shipment } from "@/types";

const data:Shipment[]=[
 {id:"RH-10482",from:"Москва",to:"Казань",date:"10 сентября 2026",cargo:"Строительные материалы",weight:"20 т",vehicle:"Тент 20 т",price:"85 000 ₽",status:"in_transit",company:"ООО «СтройТранс»"},
 {id:"RH-10479",from:"Санкт-Петербург",to:"Москва",date:"11 сентября 2026",cargo:"Оборудование",weight:"12 т",vehicle:"Тент",price:"72 000 ₽",status:"accepted",company:"ООО «СеверЛогистик»"},
 {id:"RH-10471",from:"Екатеринбург",to:"Самара",date:"12 сентября 2026",cargo:"Паллетированный груз",weight:"18 т",vehicle:"Фура 20 т",price:"64 000 ₽",status:"offered",company:"АО «УралТрейд»"},
 {id:"RH-10465",from:"Нижний Новгород",to:"Пермь",date:"14 сентября 2026",cargo:"Мебель",weight:"9 т",vehicle:"Тент 10 т",price:"48 000 ₽",status:"published",company:"ИП Волков"},
];

export default function ShipmentsPage(){const [query,setQuery]=useState("");const [status,setStatus]=useState("all");const filtered=useMemo(()=>data.filter(x=>`${x.from} ${x.to} ${x.cargo}`.toLowerCase().includes(query.toLowerCase())&&(status==="all"||x.status===status)),[query,status]);return <div className="mx-auto max-w-7xl"><PageHeader eyebrow="RohBar" title="Перевозки" description="Ищите подходящие грузы и управляйте заявками." action={<Button href="/shipments/new">Создать заявку</Button>}/><div className="mb-5 grid gap-3 lg:grid-cols-[1fr_220px]"><div className="relative"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} className={`${inputClass} pl-11`} placeholder="Город, маршрут или груз"/></div><div className="relative"><SlidersHorizontal size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><select value={status} onChange={e=>setStatus(e.target.value)} className={`${inputClass} appearance-none pl-10`}><option value="all">Все статусы</option><option value="published">Опубликована</option><option value="offered">Есть предложения</option><option value="accepted">Принята</option><option value="in_transit">В пути</option></select></div></div><div className="space-y-4">{filtered.map(item=><ShipmentCard key={item.id} {...item}/>)}</div>{!filtered.length&&<div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center"><p className="font-black">Ничего не найдено</p><p className="mt-1 text-sm text-slate-500">Измените параметры поиска и попробуйте снова.</p></div>}<div className="sr-only"><Field label="Поиск"> </Field></div></div>}
