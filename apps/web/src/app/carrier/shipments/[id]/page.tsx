"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Truck, UserRound } from "lucide-react";
import { Button, Card, Field, PageHeader, StatusBadge, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { DriverAssignment, FleetVehicle, Shipment, ShipmentOffer } from "@/types";

export default function CarrierShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [offers, setOffers] = useState<ShipmentOffer[]>([]);
  const [assignment, setAssignment] = useState<DriverAssignment | null>(null);
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void params.then(async ({ id: shipmentId }) => {
      const [shipmentResult, offersResult, assignmentsResult, fleetResult] = await Promise.all([
        api.shipments.get(shipmentId),
        api.offers.list(shipmentId),
        api.drivers.assignments(),
        api.fleet.list(),
      ]);
      if (!active) return;
      setId(shipmentId);
      if (shipmentResult.error) setError(shipmentResult.error.message);
      else setShipment(shipmentResult.data);
      if (!offersResult.error) setOffers(offersResult.data);
      if (!assignmentsResult.error) {
        setAssignment(assignmentsResult.data.find((item) => item.shipmentId === shipmentId) || null);
      }
      if (!fleetResult.error) setFleet(fleetResult.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [params]);

  const accepted = useMemo(
    () => offers.find((offer) => offer.status === "accepted"),
    [offers],
  );

  async function assign(event: React.FormEvent) {
    event.preventDefault();
    if (!id || busy || !driverId.trim()) return;
    setBusy(true);
    setError("");
    const result = await api.drivers.assign(id, {
      driverId: driverId.trim(),
      vehicleId: vehicleId || null,
    });
    if (result.error) setError(result.error.message);
    else setAssignment(result.data);
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>Загрузка рейса…</Card>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <h1 className="text-xl font-black">Рейс недоступен</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "Перевозка не найдена."}</p>
          <Button href="/carrier/shipments" variant="secondary" className="mt-5">К перевозкам</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="RohBar · перевозчик"
        title={`Рейс ${shipment.id}`}
        description={`${shipment.from} → ${shipment.to}`}
        action={
          <Button href="/carrier/shipments" variant="secondary">
            <ArrowLeft size={17} />Все перевозки
          </Button>
        }
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-400">Маршрут</p>
                <h2 className="mt-1 text-2xl font-black">{shipment.from} → {shipment.to}</h2>
                <p className="mt-2 text-slate-500">{shipment.cargo} · {shipment.weight}</p>
              </div>
              <StatusBadge status={shipment.status} />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Metric label="Дата" value={shipment.date} />
              <Metric label="Транспорт" value={shipment.vehicle} />
              <Metric label="Стоимость" value={shipment.price} />
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-black">Назначение водителя</h2>
            {assignment ? (
              <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-white text-teal-700">
                      <UserRound size={19} />
                    </span>
                    <div>
                      <p className="font-black">{assignment.driverName}</p>
                      <p className="text-sm text-slate-500">{assignment.phone || "Телефон не указан"}</p>
                    </div>
                  </div>
                  <CheckCircle2 className="text-teal-600" size={20} />
                </div>
                {assignment.vehiclePlate && (
                  <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Truck size={16} />{assignment.vehiclePlate}
                  </p>
                )}
              </div>
            ) : accepted ? (
              <form onSubmit={assign} className="mt-5 space-y-4">
                <p className="text-sm text-slate-500">
                  Укажите ID зарегистрированного аккаунта водителя. Водитель видит свой ID в профиле RohBar.
                </p>
                <Field label="ID водителя" required>
                  <input
                    className={inputClass}
                    required
                    value={driverId}
                    onChange={(event) => setDriverId(event.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Автомобиль">
                  <select className={inputClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                    <option value="">Без автомобиля</option>
                    {fleet.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.plate} · {vehicle.model}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? "Назначение…" : "Назначить водителя"}
                </Button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Назначить водителя можно после того, как ваше предложение будет принято заказчиком.
              </p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="font-black">Ваше предложение</h2>
            {accepted ? (
              <div className="mt-4">
                <StatusBadge status="accepted" />
                <p className="mt-3 text-lg font-black">{accepted.carrierName}</p>
                <p className="mt-1 text-sm text-slate-500">{accepted.vehicle}</p>
                <p className="mt-4 text-2xl font-black">{accepted.price}</p>
                <p className="mt-1 text-sm text-slate-500">Срок: {accepted.eta}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Принятое предложение ещё не найдено.</p>
            )}
          </Card>
          <Card>
            <h2 className="font-black">Состояние</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Все изменения рейса сохраняются в backend RohBar и доступны участникам согласно их роли.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
