"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MapPin, Package, Phone, Truck } from "lucide-react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { createAutomationEvent, dispatchAutomation } from "@/lib/automation";
import type { Shipment, ShipmentStatus } from "@/types";

const nextStatus:Record<ShipmentStatus,ShipmentStatus|undefined>={published:"accepted",offered:"accepted",accepted:"in_transit",in_transit:"delivered",delivered:"completed",completed:undefined};
const actionLabel:Record<ShipmentStatus,string>={published:"Подтвердить принятие",offered:"Подтвердить принятие",accepted:"Начать рейс",in_transit:"Подтвердить доставку",delivered:"Завершить рейс",completed:"Рейс завершён"};

export default function DriverShipment({params}:{params:Promise<{id:string}>}){
 const [id,setId]=useState("");const [shipment,setShipment]=useState<Shipment|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{params.then(async({id:shipmentId})=>{setId(shipmentId);const r=await api.shipments.get(shipmentId);if(r.data)setShipment(r.data)})},[params]);
 async function changeStatus(){if(!shipment||busy)return;const status=nextStatus[shipment.status];if(!status)return;setBusy(true);const r=await api.shipments.status(shipment.id,status);if(r.data){setShipment(r.data);await dispatchAutomation(createAutomationEvent(status==="completed"?"shipment.completed":"shipment.status_changed",shipment.id,"driver_001",{status}))}setBusy(false)}
 if(!shipment)return <div className="mx-auto max-w-5xl"><Card>Загрузка рейса…</Card></div>;
 return <div className="mx-auto max-w-5xl"><Link href="/driver" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/>Мои рейсы</Link><PageHeader eyebrow="RohBar · рейс" title={`${shipment.from} → ${shipment.to}`} description={`${id} · ${shipment.cargo} · ${shipment.weight}`} /><div className="grid gap-6 lg:grid-cols-[1.4fr_.8fr]"><div className="space-y-6"><Card><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-400">Текущий статус</p><div className="mt-2"><StatusBadge status={shipment.status}/></div></div><Truck className="text-teal-700" size={30}/></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Info icon={<MapPin/>} label="Погрузка" value={`${shipment.from} · ${shipment.date}`}/><Info icon={<MapPin/>} label="Выгрузка" value={`${shipment.to} · следующий день`}/><Info icon={<Package/>} label="Груз" value={`${shipment.cargo} · ${shipment.weight}`}/><Info icon={<Truck/>} label="Автомобиль" value={shipment.vehicle}/></div></Card><Card><h2 className="text-lg font-black">Обновление статуса</h2><p className="mt-1 text-sm text-slate-500">Каждое изменение отправляется в backend и automation как доменное событие.</p><Button className="mt-5 w-full sm:w-auto" onClick={changeStatus} disabled={busy||shipment.status==="completed"}>{busy?"Сохранение…":actionLabel[shipment.status]}</Button></Card></div><aside className="space-y-6"><Card><h2 className="font-black">Диспетчер</h2><p className="mt-2 font-bold">Алексей Морозов</p><p className="text-sm text-slate-500">RohBar · диспетчер</p><a href="tel:+79000000000" className="mt-4 inline-flex items-center gap-2 font-bold text-teal-700"><Phone size={17}/>Позвонить</a></Card><Card><div className="flex items-center gap-3"><CheckCircle2 className="text-teal-700"/><div><p className="font-black">{shipment.status==="completed"?"Рейс завершён":"Маршрут активен"}</p><p className="text-sm text-slate-500">Статус синхронизируется через API.</p></div></div></Card></aside></div></div>;
}
function Info({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-teal-700">{icon}<span className="text-xs font-bold uppercase text-slate-400">{label}</span></div><p className="mt-3 font-bold">{value}</p></div>}
