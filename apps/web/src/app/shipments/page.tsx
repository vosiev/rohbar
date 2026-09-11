"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader, ShipmentCard, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { Role, Shipment, ShipmentStatus } from "@/types";

const statusOptions: Array<{ value: "all" | ShipmentStatus; label: string }> = [
  { value: "all", label: "Все статусы" },
  { value: "published", label: "Опубликована" },
  { value: "offered", label: "Есть предложения" },
  { value: "accepted", label: "Принята" },
  { value: "in_transit", label: "В пути" },
  { value: "delivered", label: "Доставлена" },
  { value: "completed", label: "Завершена" },
];

export default function ShipmentsPage() {
  const [items, setItems] = useState<Shipment[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ShipmentStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([api.shipments.list(), api.auth.me()]).then(([shipments, user]) => {
      if (!active) return;
      if (shipments.error) setError(shipments.error.message);
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
        title="Перевозки"
        description="Актуальные заявки и рейсы из backend RohBar с учётом вашей роли."
        action={canCreate ? <Button href="/shipments/new">Создать заявку</Button> : undefined}
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
            placeholder="Город, маршрут, груз или номер заявки"
            aria-label="Поиск перевозок"
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
            aria-label="Фильтр по статусу"
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
          {error}
        </p>
      )}

      {loading ? (
        <Card>
          <p className="text-sm font-semibold text-slate-500">Загружаем перевозки…</p>
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
              <p className="font-black">Перевозки не найдены</p>
              <p className="mt-1 text-sm text-slate-500">
                {items.length
                  ? "Измените параметры поиска или фильтр статуса."
                  : "Для вашей роли пока нет доступных перевозок."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
