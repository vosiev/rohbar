"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, Navigation, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader, StatCard, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { Shipment, ShipmentStatus } from "@/types";

export default function DriverDashboard() {
  const [trips, setTrips] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api.shipments.list().then((result) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setTrips(result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const active = trips.filter((trip) => trip.status === "in_transit").length;
    const ready = trips.filter((trip) => trip.status === "accepted").length;
    const finished = trips.filter((trip) => ["delivered", "completed"].includes(trip.status)).length;
    return { active, ready, finished };
  }, [trips]);

  async function updateStatus(id: string, status: ShipmentStatus) {
    if (busy) return;
    setBusy(id);
    setError("");
    const result = await api.shipments.status(id, status);
    if (result.error) setError(result.error.message);
    else setTrips((current) => current.map((trip) => (trip.id === id ? result.data : trip)));
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="RohBar · водитель"
        title="Мои рейсы"
        description="Назначенные вам перевозки и их фактическое состояние в RohBar."
        action={
          <Button href="/shipments">
            Все перевозки <ArrowRight size={17} />
          </Button>
        }
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Navigation} label="В пути" value={String(metrics.active)} />
        <StatCard icon={Truck} label="Готовы к старту" value={String(metrics.ready)} />
        <StatCard icon={CheckCircle2} label="Завершены" value={String(metrics.finished)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
        <Card>
          <div>
            <h2 className="text-lg font-black">Назначенные рейсы</h2>
            <p className="mt-1 text-sm text-slate-500">Статусы обновляются через backend RohBar.</p>
          </div>

          {loading ? (
            <p className="mt-5 text-sm font-semibold text-slate-500">Загружаем рейсы…</p>
          ) : trips.length ? (
            <div className="mt-5 space-y-4">
              {trips.map((trip) => (
                <article key={trip.id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400">{trip.id}</p>
                      <h3 className="mt-1 text-lg font-black">{trip.from} → {trip.to}</h3>
                      <p className="mt-2 text-sm text-slate-500">{trip.cargo} · {trip.weight}</p>
                      <p className="mt-3 text-sm font-semibold text-slate-600">{trip.date}</p>
                    </div>
                    <StatusBadge status={trip.status} />
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button href={`/driver/shipments/${trip.id}`}>Открыть рейс</Button>
                    {trip.status === "accepted" && (
                      <Button disabled={busy === trip.id} onClick={() => updateStatus(trip.id, "in_transit")}>
                        {busy === trip.id ? "Обновление…" : "Начать рейс"}
                      </Button>
                    )}
                    {trip.status === "in_transit" && (
                      <Button disabled={busy === trip.id} onClick={() => updateStatus(trip.id, "delivered")}>
                        {busy === trip.id ? "Обновление…" : "Отметить доставленным"}
                      </Button>
                    )}
                    {trip.status === "delivered" && (
                      <Button disabled={busy === trip.id} onClick={() => updateStatus(trip.id, "completed")}>
                        {busy === trip.id ? "Обновление…" : "Завершить рейс"}
                      </Button>
                    )}
                  </div>

                  {trip.status === "completed" && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                      <CheckCircle2 size={17} />
                      Рейс завершён
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">Назначенных рейсов пока нет.</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-teal-50 text-teal-700">
              <MapPin size={20} />
            </span>
            <div>
              <h2 className="font-black">Работа с рейсом</h2>
              <p className="mt-1 text-sm text-slate-500">Маршрут, груз и события доступны в карточке перевозки.</p>
            </div>
          </div>
          <Button href="/notifications" variant="secondary" className="mt-5 w-full">
            Уведомления
          </Button>
          <Link href="/profile" className="mt-5 inline-flex text-sm font-bold text-slate-600">
            Мой профиль <ArrowRight size={15} className="ml-1" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
