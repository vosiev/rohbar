"use client";

import { useEffect, useState } from "react";
import { ArrowRight, UserRound, Truck } from "lucide-react";
import { Button, Card, PageHeader, StatCard, StatusBadge } from "@/components/rohbar-ui";
import { useMessages } from "@/lib/i18n-context";
import { operationMessages } from "@/lib/messages/operations";
import { formatError } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { api } from "@/lib/api";
import type { DriverAssignment, Shipment } from "@/types";

export default function CarrierActivePage() {
  const { m, locale } = useMessages(operationMessages);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | string>("");

  useEffect(() => {
    let active = true;
    void Promise.all([api.shipments.list(), api.drivers.assignments()]).then(([shipmentResult, assignmentResult]) => {
      if (!active) return;
      if (shipmentResult.error) setError(shipmentResult.error);
      else {
        setShipments(
          shipmentResult.data.filter((shipment) =>
            ["accepted", "in_transit", "delivered"].includes(shipment.status),
          ),
        );
      }
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
        eyebrow={m("carrierEyebrow")}
        title={m("activeTrips")}
        description={m("activeDescription")}
        action={
          <Button href="/carrier/shipments">
             {m("findCargo")} <ArrowRight size={17} />
          </Button>
        }
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formatError(error, locale)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Truck} label={m("activeTrips")} value={String(shipments.length)} />
        <StatCard icon={UserRound} label={m("assignments")} value={String(assignments.length)} />
        <StatCard
          icon={ArrowRight}
          label={m("inTransit")}
          value={String(shipments.filter((shipment) => shipment.status === "in_transit").length)}
        />
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-black">{m("operationsList")}</h2>
        <p className="mt-1 text-sm text-slate-500">
           {m("operationsDescription")} </p>

        {loading ? (
          <p className="mt-5 text-sm font-semibold text-slate-500">{m("loadingActive")}</p>
        ) : (
          <div className="mt-5 space-y-3">
            {!shipments.length ? (
              <p className="py-8 text-center text-sm text-slate-500">{m("noActive")}</p>
            ) : (
              shipments.map((shipment) => {
                const assignment = assignments.find((item) => item.shipmentId === shipment.id);
                return (
                  <div key={shipment.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-400">{shipment.id}</span>
                          <StatusBadge status={shipment.status} />
                        </div>
                        <h3 className="mt-2 text-lg font-black">{shipment.from} → {shipment.to}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {shipment.cargo} · {shipment.weight} · {shipment.price}
                        </p>
                        {assignment && (
                          <p className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                            <UserRound size={16} />
                            {assignment.driverName}
                            {assignment.vehiclePlate ? ` · ${assignment.vehiclePlate}` : ""}
                          </p>
                        )}
                      </div>
                      <Button href={`/carrier/shipments/${shipment.id}`}>
                         {m("manageTrip")} <ArrowRight size={16} />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
