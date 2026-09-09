"use client";

import { useEffect, useState } from "react";
import { Truck, UsersRound, Plus, X, Save } from "lucide-react";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { FleetVehicle } from "@/types";

export default function Fleet() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [body, setBody] = useState("Тент");
  const [capacity, setCapacity] = useState("20 т");
  const [volume, setVolume] = useState("82 м³");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const result = await api.fleet.list();
    if (result.error) setError(result.error.message);
    else setVehicles(result.data);
  }

  useEffect(() => { void load(); }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await api.fleet.create({ model: model.trim(), plate: plate.trim(), body, capacity, volume });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    setVehicles(current => [result.data, ...current]);
    setModel("");
    setPlate("");
    setOpen(false);
    setBusy(false);
  }

  return <div className="mx-auto max-w-7xl"><PageHeader eyebrow="RohBar · перевозчик" title="Автопарк" description="Транспорт и водители для автоматического подбора заявок." action={<Button onClick={()=>setOpen(true)}><Plus size={17}/>Добавить транспорт</Button>}/>{error&&<p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{vehicles.map(vehicle=><Card key={vehicle.id}><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-2xl bg-slate-50"><Truck/></span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${vehicle.status==="available"?"bg-emerald-50 text-emerald-700":"bg-blue-50 text-blue-700"}`}>{vehicle.status==="available"?"Доступен":vehicle.status==="assigned"?"Назначен":"Обслуживание"}</span></div><h2 className="mt-5 text-lg font-black">{vehicle.model}</h2><p className="mt-1 text-sm text-slate-500">{vehicle.plate} · {vehicle.body} · {vehicle.capacity} · {vehicle.volume}</p>{vehicle.driverName&&<p className="mt-2 text-sm font-semibold text-slate-700">Водитель: {vehicle.driverName}</p>}</Card>)}</div>{vehicles.length===0&&<Card><p className="text-sm text-slate-500">Автопарк пока пуст. Добавьте первый транспорт.</p></Card>}<Card className="mt-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><UsersRound/></span><div><h2 className="font-black">Водители и команда</h2><p className="mt-1 text-sm text-slate-500">Назначения и доступные водители загружаются из backend.</p></div></div></Card>{open&&<div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/40 p-3 sm:place-items-center"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Добавить транспорт</h2><button onClick={()=>setOpen(false)} aria-label="Закрыть"><X/></button></div><form onSubmit={add} className="mt-6 space-y-5"><Field label="Модель" required><input className={inputClass} required minLength={2} value={model} onChange={event=>setModel(event.target.value)} placeholder="MAN TGX"/></Field><Field label="Госномер" required><input className={inputClass} required minLength={4} value={plate} onChange={event=>setPlate(event.target.value)} placeholder="А123ВС"/></Field><Field label="Тип кузова" required><select className={inputClass} value={body} onChange={event=>setBody(event.target.value)}><option>Тент</option><option>Рефрижератор</option><option>Цельнометаллический</option><option>Бортовой</option></select></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Грузоподъёмность" required><input className={inputClass} required value={capacity} onChange={event=>setCapacity(event.target.value)} placeholder="20 т"/></Field><Field label="Объём" required><input className={inputClass} required value={volume} onChange={event=>setVolume(event.target.value)} placeholder="82 м³"/></Field></div>{error&&<p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}<Button type="submit" disabled={busy} className="w-full">{busy?"Сохранение…":"Сохранить"}<Save size={17}/></Button></form></div></div>}</div>;
}
