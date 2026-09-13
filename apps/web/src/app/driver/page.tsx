"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, Navigation, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader, StatCard, StatusBadge } from "@/components/rohbar-ui";
import { useMessages } from "@/lib/i18n-context";
import { operationMessages } from "@/lib/messages/operations";
import { formatError, formatDate } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { api } from "@/lib/api";
import type { Shipment, ShipmentStatus } from "@/types";

export default function DriverDashboard() {
  const { m, locale } = useMessages(operationMessages);
  const [trips, setTrips] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | string>("");

  useEffect(() => {
    let active = true;
    void api.shipments.list().then((result) => {
      if (!active) return;
      if (result.error) setError(result.error);
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
    if (result.error) setError(result.error);
    else setTrips((current) => current.map((trip) => (trip.id === id ? result.data : trip)));
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={m("driverEyebrow")}
        title={m("myTrips")}
        description={m("driverDescription")}
        action={
          <Button href="/shipments">
             {m("allShipments")} <ArrowRight size={17} />
          </Button>
        }
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formatError(error, locale)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Navigation} label={m("inTransit")} value={String(metrics.active)} />
        <StatCard icon={Truck} label={m("readyToStart")} value={String(metrics.ready)} />
        <StatCard icon={CheckCircle2} label={m("finished")} value={String(metrics.finished)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
        <Card>
          <div>
            <h2 className="text-lg font-black">{m("assignedTrips")}</h2>
            <p className="mt-1 text-sm text-slate-500">{m("statusDescription")}</p>
          </div>

          {loading ? (
            <p className="mt-5 text-sm font-semibold text-slate-500">{m("loadingTrips")}</p>
          ) : trips.length ? (
            <div className="mt-5 space-y-4">
              {trips.map((trip) => (
                <article key={trip.id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400">{trip.id}</p>
                      <h3 className="mt-1 text-lg font-black">{trip.from} → {trip.to}</h3>
                      <p className="mt-2 text-sm text-slate-500">{trip.cargo} · {trip.weight}</p>
                      <p className="mt-3 text-sm font-semibold text-slate-600">{formatDate(trip.date, locale)}</p>
                    </div>
                    <StatusBadge status={trip.status} />
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button href={`/driver/shipments/${trip.id}`}>{m("openTrip")}</Button>
                    {trip.status === "accepted" && (
                      <Button disabled={busy === trip.id} onClick={() => updateStatus(trip.id, "in_transit")}>
                        {busy === trip.id ? m("updating") : m("startTrip")}
                      </Button>
                    )}
                    {trip.status === "in_transit" && (
                      <Button disabled={busy === trip.id} onClick={() => updateStatus(trip.id, "delivered")}>
                        {busy === trip.id ? m("updating") : m("markDelivered")}
                      </Button>
                    )}
                    {trip.status === "delivered" && (
                      <Button disabled={busy === trip.id} onClick={() => updateStatus(trip.id, "completed")}>
                        {busy === trip.id ? m("updating") : m("finishTrip")}
                      </Button>
                    )}
                  </div>

                  {trip.status === "completed" && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                      <CheckCircle2 size={17} />
                       {m("tripCompleted")} </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">{m("noAssigned")}</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-teal-50 text-teal-700">
              <MapPin size={20} />
            </span>
            <div>
              <h2 className="font-black">{m("tripManagement")}</h2>
              <p className="mt-1 text-sm text-slate-500">{m("tripCardDescription")}</p>
            </div>
          </div>
          <Button href="/notifications" variant="secondary" className="mt-5 w-full">
             {m("notifications")} </Button>
          <Link href="/profile" className="mt-5 inline-flex text-sm font-bold text-slate-600">
             {m("myProfile")} <ArrowRight size={15} className="ml-1" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
