"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Truck, UserRound } from "lucide-react";
import { Button, Card, Field, PageHeader, StatusBadge, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { formatVolumeLiters, formatWeightKg } from "@/lib/vehicles";
import type { DriverAssignment, FleetVehicle, Shipment, ShipmentOffer, TeamDriver } from "@/types";

export default function CarrierShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [offers, setOffers] = useState<ShipmentOffer[]>([]);
  const [assignment, setAssignment] = useState<DriverAssignment | null>(null);
  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [team, setTeam] = useState<TeamDriver[]>([]);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerEta, setOfferEta] = useState("");
  const [offerVehicle, setOfferVehicle] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"offer" | "driver" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void params.then(async ({ id: shipmentId }) => {
      const [shipmentResult, offersResult, assignmentsResult, fleetResult, teamResult] = await Promise.all([
        api.shipments.get(shipmentId),
        api.offers.list(shipmentId),
        api.drivers.assignments(),
        api.fleet.list(),
        api.drivers.team(),
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
      if (!teamResult.error) setTeam(teamResult.data);
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
  const ownOffer = offers[0] || null;

  async function createOffer(event: React.FormEvent) {
    event.preventDefault();
    if (!id || busy) return;
    setBusy("offer");
    setError("");
    const result = await api.offers.create(id, {
      price: offerPrice.trim(),
      eta: offerEta.trim(),
      vehicleId: offerVehicle,
    });
    if (result.error) {
      setError(result.error.message);
    } else {
      setOffers([result.data]);
      const shipmentResult = await api.shipments.get(id);
      if (!shipmentResult.error) setShipment(shipmentResult.data);
    }
    setBusy(null);
  }

  async function assign(event: React.FormEvent) {
    event.preventDefault();
    if (!id || busy || !driverId.trim()) return;
    setBusy("driver");
    setError("");
    const result = await api.drivers.assign(id, {
      driverId: driverId.trim(),
      vehicleId: vehicleId || null,
    });
    if (result.error) setError(result.error.message);
    else setAssignment(result.data);
    setBusy(null);
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
          <Button href="/carrier/shipments" variant="secondary" className="mt-5">
            К перевозкам
          </Button>
        </Card>
      </div>
    );
  }

  const canOffer = !ownOffer && ["published", "offered"].includes(shipment.status);

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
              <Metric label="Бюджет" value={shipment.price} />
            </div>
          </Card>

          {canOffer && (
            <Card>
              <h2 className="text-lg font-black">Предложить перевозку</h2>
              <p className="mt-1 text-sm text-slate-500">
                Укажите стоимость, срок и автомобиль из вашего автопарка.
              </p>
              {fleet.length ? (
                <form onSubmit={createOffer} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Стоимость" required>
                    <input
                      className={inputClass}
                      required
                      value={offerPrice}
                      onChange={(event) => setOfferPrice(event.target.value)}
                      placeholder="80 000 ₽"
                    />
                  </Field>
                  <Field label="Срок доставки" required>
                    <input
                      className={inputClass}
                      required
                      value={offerEta}
                      onChange={(event) => setOfferEta(event.target.value)}
                      placeholder="1 день"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Автомобиль" required>
                      <select
                        className={inputClass}
                        required
                        value={offerVehicle}
                        onChange={(event) => setOfferVehicle(event.target.value)}
                      >
                        <option value="">Выберите транспорт</option>
                        {fleet
                          .filter((vehicle) => vehicle.status === "available")
                          .filter((vehicle) => !shipment.selectedVehicleId || vehicle.id === shipment.selectedVehicleId)
                          .map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.plate} · {vehicle.model} · {vehicle.body} · {formatWeightKg(vehicle.capacityKg)} · {formatVolumeLiters(vehicle.volumeLiters)}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={busy !== null || !offerVehicle}>
                      {busy === "offer" ? "Отправка…" : "Отправить предложение"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-5">
                  <p className="text-sm text-slate-500">
                    Для предложения сначала добавьте транспорт в автопарк.
                  </p>
                  <Button href="/fleet" variant="secondary" className="mt-4">
                    Открыть автопарк
                  </Button>
                </div>
              )}
            </Card>
          )}

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
                  Выберите свободного водителя из вашей команды. Состав команды управляется в разделе «Автопарк».
                </p>
                <Field label="Водитель" required>
                  <select className={inputClass} required value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                    <option value="">Выберите свободного водителя</option>
                    {team.filter((driver) => !driver.busy).map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}{driver.phone ? ` · ${driver.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Автомобиль">
                  <select className={inputClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                    <option value="">Без автомобиля</option>
                    {fleet
                      .filter((vehicle) => !accepted?.vehicleId || vehicle.id === accepted.vehicleId)
                      .map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.plate} · {vehicle.model}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button type="submit" disabled={busy !== null}>
                  {busy === "driver" ? "Назначение…" : "Назначить водителя"}
                </Button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Назначить водителя можно после принятия вашего предложения заказчиком.
              </p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="font-black">Ваше предложение</h2>
            {ownOffer ? (
              <div className="mt-4">
                <OfferState status={ownOffer.status} />
                <p className="mt-3 text-lg font-black">{ownOffer.carrierName}</p>
                <p className="mt-1 text-sm text-slate-500">{ownOffer.vehicle}</p>
                <p className="mt-4 text-2xl font-black">{ownOffer.price}</p>
                <p className="mt-1 text-sm text-slate-500">Срок: {ownOffer.eta}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Вы ещё не отправляли предложение.</p>
            )}
          </Card>
          <Card>
            <h2 className="font-black">Состояние</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Заявка, предложение и назначение синхронизируются через backend RohBar.
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

function OfferState({ status }: { status: ShipmentOffer["status"] }) {
  const classes =
    status === "accepted"
      ? "bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  const label = status === "accepted" ? "Принято" : status === "rejected" ? "Отклонено" : "Ожидает решения";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${classes}`}>{label}</span>;
}
