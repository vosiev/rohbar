"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MapPin, Package, Truck } from "lucide-react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/rohbar-ui";
import { useMessages } from "@/lib/i18n-context";
import { operationMessages } from "@/lib/messages/operations";
import { formatError, formatProductValue, formatDate } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { api } from "@/lib/api";
import type { Shipment, ShipmentStatus } from "@/types";

const nextStatus: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  accepted: "in_transit",
  in_transit: "delivered",
  delivered: "completed",
};

const actionLabel: Partial<Record<ShipmentStatus, keyof typeof operationMessages>> = {
  accepted: "startTrip",
  in_transit: "confirmDelivery",
  delivered: "finishTrip",
};

export default function DriverShipment({ params }: { params: Promise<{ id: string }> }) {
  const { m, locale } = useMessages(operationMessages);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string>("");

  useEffect(() => {
    let active = true;
    void params.then(async ({ id }) => {
      const result = await api.shipments.get(id);
      if (!active) return;
      if (result.error) setError(result.error);
      else setShipment(result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [params]);

  async function changeStatus() {
    if (!shipment || busy) return;
    const status = nextStatus[shipment.status];
    if (!status) return;

    setBusy(true);
    setError("");
    const result = await api.shipments.status(shipment.id, status);
    if (result.error) setError(result.error);
    else setShipment(result.data);
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>{m("loadingTrip")}</Card>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <h1 className="text-xl font-black">{m("tripUnavailable")}</h1>
          <p className="mt-2 text-sm text-slate-500">{error ? formatError(error, locale) : m("shipmentNotFound")}</p>
          <Button href="/driver" variant="secondary" className="mt-5">{m("myTrips")}</Button>
        </Card>
      </div>
    );
  }

  const next = nextStatus[shipment.status];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/driver" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500">
        <ArrowLeft size={16} />
         {m("myTrips")} </Link>
      <PageHeader
        eyebrow={m("tripEyebrow")}
        title={`${shipment.from} → ${shipment.to}`}
        description={`${shipment.id} · ${shipment.cargo} · ${shipment.weight}`}
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formatError(error, locale)}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400">{m("currentStatus")}</p>
                <div className="mt-2"><StatusBadge status={shipment.status} /></div>
              </div>
              <Truck className="text-teal-700" size={30} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Info icon={<MapPin />} label={m("loadingCargo")} value={`${shipment.from} · ${formatDate(shipment.date, locale)}`} />
              <Info icon={<MapPin />} label={m("unloadingCargo")} value={shipment.to} />
              <Info icon={<Package />} label={m("cargo")} value={`${shipment.cargo} · ${shipment.weight}`} />
              <Info icon={<Truck />} label={m("transport")} value={formatProductValue(shipment.vehicle, locale)} />
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-black">{m("statusUpdate")}</h2>
            <p className="mt-1 text-sm text-slate-500">
               {m("statusHistoryHelp")} </p>
            {next ? (
              <Button className="mt-5 w-full sm:w-auto" onClick={changeStatus} disabled={busy}>
                {busy ? m("saving") : m(actionLabel[shipment.status] ?? "statusUpdate")}
              </Button>
            ) : (
              <p className="mt-5 text-sm font-semibold text-slate-600">
                 {m("noDriverAction")} </p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="font-black">{m("tripInfo")}</h2>
            <p className="mt-2 text-sm text-slate-500">{m("customer")}</p>
            <p className="mt-1 font-bold">{shipment.company}</p>
            <p className="mt-4 text-sm text-slate-500">{m("price")}</p>
            <p className="mt-1 text-xl font-black">{shipment.price}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-teal-700" />
              <div>
                <p className="font-black">{shipment.status === "completed" ? m("tripCompleted") : m("statusSynced")}</p>
                <p className="text-sm text-slate-500">{m("dataSource")}</p>
              </div>
            </div>
          </Card>
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
        <span className="text-xs font-bold uppercase text-slate-400">{label}</span>
      </div>
      <p className="mt-3 font-bold">{value}</p>
    </div>
  );
}
