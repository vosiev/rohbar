"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, Package, Truck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { useMessages } from "@/lib/i18n-context";
import { shipmentMessages } from "@/lib/messages/shipments";
import { formatError, formatDate, formatProductValue } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import type { Role, Shipment, ShipmentEvent } from "@/types";

export default function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { m, locale } = useMessages(shipmentMessages);
  const eventLabels: Record<string, string> = {
    "shipment.created": m("shipmentPublished"),
    "shipment.cancelled": m("shipmentCancelled"),
    "offer.created": m("newOfferReceived"),
    "offer.accepted": m("carrierOfferAccepted"),
    "driver.assigned": m("driverAssigned"),
    "shipment.status_changed": m("shipmentStatusChanged"),
  };
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [offerCount, setOfferCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | string>("");

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
        setError(shipmentResult.error);
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
          <p className="text-sm font-semibold text-slate-500">{m("loadingShipment")}</p>
        </Card>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <h1 className="text-xl font-black">{m("shipmentUnavailable")}</h1>
          <p className="mt-2 text-sm text-slate-500">{error ? formatError(error, locale) : m("shipmentNotFound")}</p>
          <Button href="/shipments" variant="secondary" className="mt-5">
            {m("toShipments")}
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
  const actionLabel = role === "carrier" ? m("manageTrip") : role === "driver" ? m("openTrip") : m("offers");

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/shipments"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        {m("backToShipments")}
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
                <p className="mt-2 text-sm text-slate-500">{m("intercityShipment", { date: formatDate(shipment.date, locale) })}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{m("budget")}</p>
                <p className="mt-1 text-2xl font-black">{shipment.price}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Info icon={<MapPin />} label={m("route")} value={`${shipment.from} → ${shipment.to}`} />
              <Info icon={<Package />} label={m("cargo")} value={`${shipment.cargo} · ${shipment.weight}`} />
              <Info icon={<Truck />} label={m("transport")} value={formatProductValue(shipment.vehicle, locale)} />
              <Info icon={<UserRound />} label={m("customer")} value={shipment.company} />
            </div>

            <div className="mt-7 rounded-2xl bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-teal-700" />
                <h2 className="font-black">{m("route")}</h2>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">{m("loadingPoint")}</p>
                  <p className="mt-1 font-bold">{shipment.from}</p>
                  <p className="text-sm text-slate-500">{formatDate(shipment.date, locale)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">{m("unloadingPoint")}</p>
                  <p className="mt-1 font-bold">{shipment.to}</p>
                  <p className="text-sm text-slate-500">{m("shipmentTerms")}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="mt-6">
            <h2 className="text-lg font-black">{m("eventHistory")}</h2>
            {events.length ? (
              <div className="mt-5 space-y-5">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-teal-600" />
                    <div>
                      <p className="text-sm font-bold">{eventLabels[event.event] || m("unknownEvent")}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(event.occurredAt, locale, { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">{m("noEvents")}</p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="font-black">{m("actions")}</h2>
            <Button href={actionHref} className="mt-4 w-full">
              {actionLabel}
            </Button>
            <Button variant="secondary" href="/notifications" className="mt-3 w-full">
              {m("notifications")}
            </Button>
          </Card>

          {offerCount !== null && (
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Clock3 size={18} />
                </span>
                <div>
                  <p className="font-bold">{m("offerCount", { count: offerCount })}</p>
                  <p className="text-sm text-slate-500">{m("currentOffers")}</p>
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
