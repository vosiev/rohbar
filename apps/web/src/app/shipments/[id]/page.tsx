"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, Package, Truck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { Role, Shipment, ShipmentEvent } from "@/types";

const eventLabels: Record<string, string> = {
  "shipment.created": "Заявка опубликована",
  "offer.created": "Получено новое предложение",
  "offer.accepted": "Предложение перевозчика принято",
  "driver.assigned": "Назначен водитель",
  "shipment.status_changed": "Статус перевозки изменён",
};

export default function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [offerCount, setOfferCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void params.then(async ({ id }) => {
      const [shipmentResult, eventsResult, userResult] = await Promise.all([
        api.shipments.get(id),
        api.shipments.events(id),
        api.auth.me(),
      ]);

      if (!active) return;

      if (shipmentResult.error) {
        setError(shipmentResult.error.message);
        setLoading(false);
        return;
      }

      setShipment(shipmentResult.data);
      if (!eventsResult.error) setEvents(eventsResult.data);

      if (!userResult.error) {
        setRole(userResult.data.role);
        if (userResult.data.role === "customer" || userResult.data.role === "admin") {
          const offersResult = await api.offers.list(id);
          if (active && !offersResult.error) setOfferCount(offersResult.data.length);
        }
      }

      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [params]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <p className="text-sm font-semibold text-slate-500">Загружаем перевозку…</p>
        </Card>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <h1 className="text-xl font-black">Перевозка недоступна</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "Заявка не найдена."}</p>
          <Button href="/shipments" variant="secondary" className="mt-5">
            К перевозкам
          </Button>
        </Card>
      </div>
    );
  }

  const actionHref =
    role === "carrier"
      ? `/carrier/shipments/${shipment.id}`
      : role === "driver"
        ? `/driver/shipments/${shipment.id}`
        : `/offers?shipment=${encodeURIComponent(shipment.id)}`;
  const actionLabel = role === "carrier" ? "Управление рейсом" : role === "driver" ? "Открыть рейс" : "Предложения";

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/shipments"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Назад к перевозкам
      </Link>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.5fr_.8fr]">
        <div>
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <StatusBadge status={shipment.status} />
                <p className="mt-3 text-xs font-bold text-slate-400">{shipment.id}</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight">
                  {shipment.from} → {shipment.to}
                </h1>
                <p className="mt-2 text-sm text-slate-500">{shipment.date} · межгородская перевозка</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Бюджет</p>
                <p className="mt-1 text-2xl font-black">{shipment.price}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Info icon={<MapPin />} label="Маршрут" value={`${shipment.from} → ${shipment.to}`} />
              <Info icon={<Package />} label="Груз" value={`${shipment.cargo} · ${shipment.weight}`} />
              <Info icon={<Truck />} label="Транспорт" value={shipment.vehicle} />
              <Info icon={<UserRound />} label="Заказчик" value={shipment.company} />
            </div>

            <div className="mt-7 rounded-2xl bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-teal-700" />
                <h2 className="font-black">Маршрут</h2>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Погрузка</p>
                  <p className="mt-1 font-bold">{shipment.from}</p>
                  <p className="text-sm text-slate-500">{shipment.date}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Выгрузка</p>
                  <p className="mt-1 font-bold">{shipment.to}</p>
                  <p className="text-sm text-slate-500">По условиям заявки</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="mt-6">
            <h2 className="text-lg font-black">История событий</h2>
            {events.length ? (
              <div className="mt-5 space-y-5">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-teal-600" />
                    <div>
                      <p className="text-sm font-bold">{eventLabels[event.event] || event.event}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(event.occurredAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">История событий пока пуста.</p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="font-black">Действия</h2>
            <Button href={actionHref} className="mt-4 w-full">
              {actionLabel}
            </Button>
            <Button variant="secondary" href="/notifications" className="mt-3 w-full">
              Уведомления
            </Button>
          </Card>

          {offerCount !== null && (
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Clock3 size={18} />
                </span>
                <div>
                  <p className="font-bold">{offerCount} предложений</p>
                  <p className="text-sm text-slate-500">Данные из backend RohBar</p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-teal-700">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <p className="mt-3 font-bold">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
