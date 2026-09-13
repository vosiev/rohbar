"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader, ShipmentCard, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { useMessages } from "@/lib/i18n-context";
import { shipmentMessages } from "@/lib/messages/shipments";
import { formatError } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import type { Role, Shipment, ShipmentStatus } from "@/types";

export default function ShipmentsPage() {
  const { m, locale } = useMessages(shipmentMessages);
  const statusOptions: Array<{ value: "all" | ShipmentStatus; label: string }> = [
    { value: "all", label: m("allStatuses") },
    { value: "published", label: m("published") },
    { value: "offered", label: m("offered") },
    { value: "accepted", label: m("accepted") },
    { value: "in_transit", label: m("inTransit") },
    { value: "delivered", label: m("delivered") },
    { value: "completed", label: m("completed") },
  ];
  const [items, setItems] = useState<Shipment[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ShipmentStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | string>("");

  useEffect(() => {
    let active = true;
    void Promise.all([api.shipments.list(), api.auth.me()]).then(([shipments, user]) => {
      if (!active) return;
      if (shipments.error) setError(shipments.error);
      else setItems(shipments.data);
      if (!user.error) setRole(user.data.role);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return items.filter((shipment) => {
      const matchesQuery =
        !normalized ||
        `${shipment.id} ${shipment.from} ${shipment.to} ${shipment.cargo} ${shipment.company}`
          .toLocaleLowerCase("ru")
          .includes(normalized);
      const matchesStatus = status === "all" || shipment.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [items, query, status]);

  const canCreate = role === "customer" || role === "admin";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="RohBar"
        title={m("shipments")}
        description={m("shipmentsDescription")}
        action={canCreate ? <Button href="/shipments/new">{m("createShipment")}</Button> : undefined}
      />

      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${inputClass} pl-11`}
            placeholder={m("searchPlaceholder")}
            aria-label={m("searchShipments")}
          />
        </div>
        <div className="relative">
          <SlidersHorizontal
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | ShipmentStatus)}
            className={`${inputClass} appearance-none pl-10`}
            aria-label={m("filterStatus")}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formatError(error, locale)}
        </p>
      )}

      {loading ? (
        <Card>
          <p className="text-sm font-semibold text-slate-500">{m("loadingShipments")}</p>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {filtered.map((shipment) => (
              <ShipmentCard key={shipment.id} {...shipment} />
            ))}
          </div>
          {!filtered.length && (
            <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center">
              <p className="font-black">{m("noShipments")}</p>
              <p className="mt-1 text-sm text-slate-500">
                {items.length
                  ? m("changeSearch")
                  : m("noAccessibleShipments")}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
