"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Truck, WalletCards } from "lucide-react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { createAutomationEvent, dispatchAutomation } from "@/lib/automation";
import type { ShipmentOffer } from "@/types";

const fallbackShipment="RH-10482";

export default function OffersPage(){
 const [offers,setOffers]=useState<ShipmentOffer[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState<string|null>(null);
 const shipmentId=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("shipment")||fallbackShipment:fallbackShipment;
 useEffect(()=>{api.offers.list(shipmentId).then(result=>{if(!result.error)setOffers(result.data);setLoading(false)});},[shipmentId]);
 const accepted=useMemo(()=>offers.find(o=>o.status==="accepted"),[offers]);
 async function accept(id:string){
  setBusy(id);
  const result=await api.offers.accept(id);
  if(!result.error){
   setOffers(current=>current.map(o=>({...o,status:o.id===id?"accepted":"rejected"})));
   setSelected(id);
   const event=createAutomationEvent("offer.accepted",shipmentId,"usr_001",{offerId:id});
   await dispatchAutomation(event).catch(()=>undefined);
  }
  setBusy(null);
 }
 return <div className="mx-auto max-w-5xl"><PageHeader eyebrow="RohBar · предложения" title="Предложения перевозчиков" description={`Сравните стоимость, транспорт и срок доставки для заявки ${shipmentId}.`}/>
 {accepted&&<div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Перевозчик выбран: {accepted.carrierName}.</div>}
 {loading?<Card><p className="text-sm font-semibold text-slate-500">Загружаем предложения…</p></Card>:<div className="space-y-4">{offers.map(o=><Card key={o.id} className={o.status==="accepted"||selected===o.id?"border-teal-300 ring-2 ring-teal-600/10":""}><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="flex gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Truck size={22}/></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black">{o.carrierName}</h2>{o.status==="accepted"&&<StatusBadge status="accepted"/>}</div><p className="mt-1 text-sm text-slate-500">{o.vehicle}</p><div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-600"><span className="inline-flex items-center gap-1"><Clock3 size={15}/>{o.etaDays} дн.</span><span className="inline-flex items-center gap-1"><WalletCards size={15}/>{o.price.toLocaleString("ru-RU")} ₽</span></div></div></div><Button disabled={o.status!=="pending"||busy===o.id} onClick={()=>accept(o.id)}>{o.status==="accepted"?<><Check size={17}/>Перевозчик выбран</>:busy===o.id?"Выбираем…":"Выбрать перевозчика"}</Button></div></Card>)}{offers.length===0&&<Card><p className="font-bold">Пока нет предложений</p><p className="mt-1 text-sm text-slate-500">Когда перевозчики откликнутся на заявку, предложения появятся здесь.</p></Card>}</div>}
 </div>;
}
