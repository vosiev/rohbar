"use client";

import { Activity, Database, Server, Truck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/rohbar-ui";
import { useMessages } from "@/lib/i18n-context";
import { operationMessages } from "@/lib/messages/operations";
import { formatError } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { api } from "@/lib/api";
import type { DriverAssignment, FleetVehicle, HealthStatus, Shipment } from "@/types";

type About = {
  name: string;
  version: string;
  frontend_origin: string;
  realtime: string[];
  telegram: boolean;
};

export default function AdminPage() {
  const { m, locale } = useMessages(operationMessages);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [about, setAbout] = useState<About | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | string>("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.health(),
      api.about(),
      api.shipments.list(),
      api.fleet.list(),
      api.drivers.assignments(),
    ]).then(([healthResult, aboutResult, shipmentResult, fleetResult, assignmentResult]) => {
      if (!active) return;
      const firstError = [healthResult, aboutResult, shipmentResult, fleetResult, assignmentResult]
        .map((result) => result.error)
        .find(Boolean);
      if (firstError) setError(firstError);
      if (!healthResult.error) setHealth(healthResult.data);
      if (!aboutResult.error) setAbout(aboutResult.data);
      if (!shipmentResult.error) setShipments(shipmentResult.data);
      if (!fleetResult.error) setFleet(fleetResult.data);
      if (!assignmentResult.error) setAssignments(assignmentResult.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={m("adminEyebrow")}
        title={m("controlCenter")}
        description={m("adminDescription")}
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formatError(error, locale)}
        </p>
      )}

      {loading ? (
        <Card>{m("loadingPlatform")}</Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Activity} label="API" value={health?.status === "ok" ? m("apiHealthy") : m("apiDegraded")} />
            <StatCard icon={Truck} label={m("shipments")} value={String(shipments.length)} />
            <StatCard icon={Server} label={m("transport")} value={String(fleet.length)} />
            <StatCard icon={UserRound} label={m("assignments")} value={String(assignments.length)} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="flex items-center gap-3">
                <Database className="text-teal-700" />
                <div>
                  <h2 className="font-black">{m("infrastructure")}</h2>
                  <p className="text-sm text-slate-500">{m("healthDescription")}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <HealthItem label="PostgreSQL" ok={health?.database === true} />
                <HealthItem label="Redis" ok={health?.redis === true} />
              </div>
              {about && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <p><strong>API:</strong> {about.name} {about.version}</p>
                  <p className="mt-1"><strong>{m("realtime")}</strong> {about.realtime.join(", ")}</p>
                  <p className="mt-1"><strong>Telegram:</strong> {about.telegram ? m("configured") : m("notConfigured")}</p>
                </div>
              )}
            </Card>

            <Card>
              <h2 className="font-black">{m("latestShipments")}</h2>
              {shipments.slice(0, 6).length ? (
                <div className="mt-4 divide-y divide-slate-100">
                  {shipments.slice(0, 6).map((shipment) => (
                    <div key={shipment.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-xs font-bold text-slate-400">{shipment.id}</p>
                        <p className="mt-1 font-bold">{shipment.from} → {shipment.to}</p>
                      </div>
                      <StatusBadge status={shipment.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">{m("noShipments")}</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function HealthItem({ label, ok }: { label: string; ok: boolean }) {
  const { m } = useMessages(operationMessages);
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className={`mt-2 font-black ${ok ? "text-emerald-700" : "text-red-700"}`}>
        {ok ? m("healthy") : m("unavailable")}
      </p>
    </div>
  );
}
