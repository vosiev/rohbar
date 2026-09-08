"use client";

import { useEffect, useState } from "react";
import { ArrowRight, UserRound, Truck } from "lucide-react";
import { Button, Card, PageHeader, StatCard, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { Shipment, DriverAssignment } from "@/types";

export default function CarrierActivePage(){
 const [shipments,setShipments]=useState<Shipment[]>([]);const [assignments,setAssignments]=useState<DriverAssignment[]>([]);
 useEffect(()=>{Promise.all([api.shipments.list(),api.drivers.list()]).then(([s,d])=>{if(s.data)setShipments(s.data.filter(x=>x.status==="accepted"||x.status==="in_transit"||x.status==="delivered"));if(d.data)setAssignments(d.data)})},[]);
 return <div className="mx-auto max-w-7xl"><PageHeader eyebrow="RohBar · перевозчик" title="Активные рейсы" description="Единый контроль принятых перевозок, назначенных водителей и статусов." action={<Button href="/carrier/shipments">Найти загрузку <ArrowRight size={17}/></Button>}/><div className="grid gap-4 sm:grid-cols-3"><StatCard icon={Truck} label="Активные рейсы" value={String(shipments.length)}/><StatCard icon={UserRound} label="Назначения" value={String(assignments.length)}/><StatCard icon={ArrowRight} label="В пути" value={String(shipments.filter(x=>x.status==="in_transit").length)}/></div><Card className="mt-6"><h2 className="text-lg font-black">Операционный список</h2><p className="mt-1 text-sm text-slate-500">Статус приходит из API; назначение водителя выполняется в карточке рейса.</p><div className="mt-5 space-y-3">{shipments.length===0?<p className="py-8 text-center text-sm text-slate-500">Активных рейсов пока нет.</p>:shipments.map(s=>{const a=assignments.find(x=>x.shipmentId===s.id);return <div key={s.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-400">{s.id}</span><StatusBadge status={s.status}/></div><h3 className="mt-2 text-lg font-black">{s.from} → {s.to}</h3><p className="mt-1 text-sm text-slate-500">{s.cargo} · {s.weight} · {s.price}</p>{a&&<p className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700"><UserRound size={16}/>{a.driverName} · {a.vehiclePlate}</p>}</div><Button href={`/carrier/shipments/${s.id}`}>Управлять рейсом <ArrowRight size={16}/></Button></div></div>})}</div></Card></div>
}
