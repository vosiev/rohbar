"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, UserRound, Truck } from "lucide-react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { createAutomationEvent, dispatchAutomation } from "@/lib/automation";
import type { DriverAssignment, Shipment, ShipmentOffer } from "@/types";

const drivers:DriverAssignment[]=[{shipmentId:"RH-10482",driverId:"drv_001",driverName:"Иван Петров",phone:"+7 900 000-00-01",vehicleId:"VH-002",vehiclePlate:"М456КМ"},{shipmentId:"RH-10482",driverId:"drv_002",driverName:"Александр Соколов",phone:"+7 900 000-00-02",vehicleId:"VH-001",vehiclePlate:"А123ВС"}];

export default function CarrierShipmentPage({params}:{params:Promise<{id:string}>}){
 const [id,setId]=useState("");
 const [shipment,setShipment]=useState<Shipment|null>(null);
 const [offers,setOffers]=useState<ShipmentOffer[]>([]);
 const [selected,setSelected]=useState<DriverAssignment|null>(null);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{params.then(async p=>{setId(p.id);const [s,o]=await Promise.all([api.shipments.get(p.id),api.offers.list(p.id)]);if(s.data)setShipment(s.data);if(o.data)setOffers(o.data);const a=drivers.find(x=>x.shipmentId===p.id);if(a)setSelected(a)})},[params]);
 const accepted=useMemo(()=>offers.find(x=>x.status==="accepted"),[offers]);
 async function assign(driver:DriverAssignment){if(!id)return;setBusy(true);const result=await api.drivers.assign(id,driver);if(result.data){setSelected(result.data);await dispatchAutomation(createAutomationEvent("driver.assigned",id,"carrier_001",{driverId:driver.driverId,driverName:driver.driverName,vehicleId:driver.vehicleId,vehiclePlate:driver.vehiclePlate}))}setBusy(false)}
 if(!shipment)return <div className="mx-auto max-w-5xl"><PageHeader eyebrow="RohBar · перевозчик" title="Загрузка рейса" description="Получаем данные перевозки…"/></div>;
 return <div className="mx-auto max-w-6xl"><PageHeader eyebrow="RohBar · перевозчик" title={`Рейс ${shipment.id}`} description={`${shipment.from} → ${shipment.to}`} action={<Button href="/shipments" variant="secondary"><ArrowLeft size={17}/>Все перевозки</Button>}/>
  <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
   <div className="space-y-6"><Card><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-slate-400">Маршрут</p><h2 className="mt-1 text-2xl font-black">{shipment.from} → {shipment.to}</h2><p className="mt-2 text-slate-500">{shipment.cargo} · {shipment.weight}</p></div><StatusBadge status={shipment.status}/></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><div><p className="text-xs font-bold text-slate-400">Дата</p><p className="mt-1 font-bold">{shipment.date}</p></div><div><p className="text-xs font-bold text-slate-400">Транспорт</p><p className="mt-1 font-bold">{shipment.vehicle}</p></div><div><p className="text-xs font-bold text-slate-400">Стоимость</p><p className="mt-1 font-bold">{shipment.price}</p></div></div></Card>
   <Card><h2 className="text-lg font-black">Назначение водителя</h2><p className="mt-1 text-sm text-slate-500">Выберите водителя и автомобиль для этого рейса.</p><div className="mt-5 space-y-3">{drivers.map(driver=><button key={driver.driverId} type="button" disabled={busy} onClick={()=>assign(driver)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.driverId===driver.driverId?"border-teal-500 bg-teal-50":"border-slate-200 hover:border-slate-300"}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-slate-100"><UserRound size={19}/></span><div><p className="font-black">{driver.driverName}</p><p className="text-sm text-slate-500">{driver.phone}</p></div></div>{selected?.driverId===driver.driverId&&<CheckCircle2 className="text-teal-600" size={20}/>}</div><div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600"><Truck size={16}/>{driver.vehiclePlate}</div></button>)}</div></Card></div>
   <aside className="space-y-6"><Card><h2 className="font-black">Предложение</h2>{accepted?<div className="mt-4"><StatusBadge status="accepted"/><p className="mt-3 text-lg font-black">{accepted.carrierName}</p><p className="mt-1 text-sm text-slate-500">{accepted.vehicle}</p><p className="mt-4 text-2xl font-black">{accepted.price}</p></div>:<p className="mt-3 text-sm text-slate-500">Принятое предложение ещё не найдено.</p>}</Card><Card><h2 className="font-black">Следующий шаг</h2><p className="mt-2 text-sm leading-6 text-slate-500">После назначения водителя backend сможет создать событие и запустить автоматические уведомления заказчику и водителю.</p></Card></aside>
  </div></div>
}
