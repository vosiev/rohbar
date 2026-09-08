"use client";
import { useMemo, useState } from "react";
import { Check, Clock3, Truck, WalletCards } from "lucide-react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/rohbar-ui";

type Offer={id:string;carrier:string;vehicle:string;price:number;eta:string;status:"pending"|"accepted"};
const initial:Offer[]=[{id:"OF-291",carrier:"ООО «СтройТранс»",vehicle:"Тент 20 т · А123ВС",price:85000,eta:"2 дня",status:"pending"},{id:"OF-288",carrier:"ООО «СеверЛогистик»",vehicle:"Тент 20 т · М456КМ",price:89000,eta:"2 дня",status:"pending"},{id:"OF-284",carrier:"ИП Абдуллоев",vehicle:"Фура 20 т · Т789ОР",price:92000,eta:"3 дня",status:"pending"}];

export default function OffersPage(){
 const [offers,setOffers]=useState(initial);
 const accepted=useMemo(()=>offers.find(o=>o.status==="accepted"),[offers]);
 function accept(id:string){setOffers(v=>v.map(x=>({...x,status:x.id===id?"accepted":"pending"})));}
 return <div className="mx-auto max-w-5xl"><PageHeader eyebrow="RohBar · предложения" title="Предложения перевозчиков" description="Сравните стоимость, транспорт и срок доставки для заявки RH-10482."/>
 {accepted&&<div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Перевозчик выбран: {accepted.carrier}. Backend должен зафиксировать это действие и создать событие выбора перевозчика.</div>}
 <div className="space-y-4">{offers.map(o=><Card key={o.id} className={o.status==="accepted"?"border-teal-300 ring-2 ring-teal-600/10":""}><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div className="flex gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Truck size={22}/></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black">{o.carrier}</h2>{o.status==="accepted"&&<StatusBadge status="accepted"/>}</div><p className="mt-1 text-sm text-slate-500">{o.vehicle}</p><div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-600"><span className="inline-flex items-center gap-1"><Clock3 size={15}/>{o.eta}</span><span className="inline-flex items-center gap-1"><WalletCards size={15}/>{o.price.toLocaleString("ru-RU")} ₽</span></div></div></div><Button disabled={o.status==="accepted"} onClick={()=>accept(o.id)}>{o.status==="accepted"?<><Check size={17}/>Перевозчик выбран</>:"Выбрать перевозчика"}</Button></div></Card>)}</div></div>;
}
