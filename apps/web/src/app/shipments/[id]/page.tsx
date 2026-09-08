import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, Package, Truck, UserRound } from "lucide-react";
import { Button, Card, StatusBadge } from "@/components/rohbar-ui";

const events = [
  ["Сегодня, 10:42", "Перевозчик получил заявку"],
  ["Сегодня, 10:31", "Опубликовано 3 предложения"],
  ["Сегодня, 09:15", "Заявка опубликована"],
];

export default async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="mx-auto max-w-5xl">
    <Link href="/shipments" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/>Назад к перевозкам</Link>
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.5fr_.8fr]">
      <div>
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><StatusBadge status="offered"/><p className="mt-3 text-xs font-bold text-slate-400">{id}</p><h1 className="mt-2 text-3xl font-black tracking-tight">Москва → Казань</h1><p className="mt-2 text-sm text-slate-500">10 сентября 2026 · межгородская перевозка</p></div>
            <div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Бюджет</p><p className="mt-1 text-2xl font-black">85 000 ₽</p></div>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Info icon={<MapPin/>} label="Маршрут" value="Москва → Казань"/>
            <Info icon={<Package/>} label="Груз" value="Строительные материалы · 20 т"/>
            <Info icon={<Truck/>} label="Транспорт" value="Тент · 20 т · 86 м³"/>
            <Info icon={<UserRound/>} label="Заказчик" value="Вектор Логистик"/>
          </div>
          <div className="mt-7 rounded-2xl bg-slate-50 p-5">
            <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-teal-700"/><h2 className="font-black">Маршрут</h2></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase text-slate-400">Погрузка</p><p className="mt-1 font-bold">Москва</p><p className="text-sm text-slate-500">10 сентября · 08:00–12:00</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Выгрузка</p><p className="mt-1 font-bold">Казань</p><p className="text-sm text-slate-500">11 сентября · до 18:00</p></div></div>
          </div>
        </Card>
        <Card className="mt-6">
          <h2 className="text-lg font-black">История событий</h2>
          <div className="mt-5 space-y-5">{events.map(([time,text])=><div key={time} className="flex gap-3"><span className="mt-1 size-2.5 shrink-0 rounded-full bg-teal-600"/><div><p className="text-sm font-bold">{text}</p><p className="mt-1 text-xs text-slate-400">{time}</p></div></div>)}</div>
        </Card>
      </div>
      <aside className="space-y-6">
        <Card><h2 className="font-black">Действия</h2><Button href={`/offers?shipment=${id}`} className="mt-4 w-full">Смотреть предложения</Button><Button variant="secondary" href="/notifications" className="mt-3 w-full">Уведомления</Button></Card>
        <Card><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Clock3 size={18}/></span><div><p className="font-bold">3 предложения</p><p className="text-sm text-slate-500">Последнее — 10 минут назад</p></div></div></Card>
      </aside>
    </div>
  </div>;
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-teal-700">{icon}<span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span></div><p className="mt-3 font-bold">{value}</p></div>;
}
