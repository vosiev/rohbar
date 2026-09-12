"use client";

import Image from "next/image";
import { Edit3, Plus, Save, Trash2, Truck, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/rohbar-ui";
import { api, type FleetVehicleInput } from "@/lib/api";
import { bodyType, formatDimensions, formatVolumeLiters, formatWeightKg, vehicleBodyTypes } from "@/lib/vehicles";
import type { FleetVehicle, TeamDriver, User, VehicleBodyCode, VehicleStatus } from "@/types";

type VehicleForm = {
  ownerEmail: string;
  model: string;
  plate: string;
  bodyCode: VehicleBodyCode;
  capacityKg: string;
  volumeM3: string;
  lengthM: string;
  widthM: string;
  heightM: string;
  year: string;
  photoUrl: string;
  status: VehicleStatus;
};

const emptyForm: VehicleForm = {
  ownerEmail: "",
  model: "",
  plate: "",
  bodyCode: "curtain",
  capacityKg: "20000",
  volumeM3: "82",
  lengthM: "13.6",
  widthM: "2.45",
  heightM: "2.7",
  year: "",
  photoUrl: "",
  status: "available",
};

function metresToMm(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : null;
}

export default function Fleet() {
  const [user, setUser] = useState<User | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<TeamDriver[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [driverEmail, setDriverEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const [meResult, fleetResult] = await Promise.all([api.auth.me(), api.fleet.list()]);
      if (!active) return;
      if (meResult.error) {
        setError(meResult.error.message);
        setLoading(false);
        return;
      }
      setUser(meResult.data);
      if (fleetResult.error) setError(fleetResult.error.message);
      else setVehicles(fleetResult.data);
      if (meResult.data.role === "carrier") {
        const teamResult = await api.drivers.team();
        if (!active) return;
        if (teamResult.error) setError(teamResult.error.message);
        else setDrivers(teamResult.data);
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedBody = useMemo(() => bodyType(form.bodyCode), [form.bodyCode]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setOpen(true);
  }

  function openEdit(vehicle: FleetVehicle) {
    setEditingId(vehicle.id);
    setForm({
      ownerEmail: "",
      model: vehicle.model,
      plate: vehicle.plate,
      bodyCode: vehicle.bodyCode || "curtain",
      capacityKg: String(vehicle.capacityKg || 20000),
      volumeM3: String((vehicle.volumeLiters || 82000) / 1000),
      lengthM: vehicle.lengthMm ? String(vehicle.lengthMm / 1000) : "",
      widthM: vehicle.widthMm ? String(vehicle.widthMm / 1000) : "",
      heightM: vehicle.heightMm ? String(vehicle.heightMm / 1000) : "",
      year: vehicle.year ? String(vehicle.year) : "",
      photoUrl: vehicle.photoUrl || "",
      status: vehicle.status,
    });
    setError("");
    setSuccess("");
    setOpen(true);
  }

  function payloadFromForm(): FleetVehicleInput | null {
    const capacityKg = Number(form.capacityKg);
    const volumeM3 = Number(form.volumeM3.replace(",", "."));
    const year = form.year ? Number(form.year) : null;
    if (!Number.isFinite(capacityKg) || capacityKg < 100) {
      setError("Укажите корректную грузоподъёмность в килограммах.");
      return null;
    }
    if (!Number.isFinite(volumeM3) || volumeM3 <= 0) {
      setError("Укажите корректный полезный объём в м³.");
      return null;
    }
    if (user?.role === "admin" && !editingId && !form.ownerEmail.trim()) {
      setError("Администратор должен указать email перевозчика-владельца автомобиля.");
      return null;
    }
    return {
      ownerEmail: form.ownerEmail.trim() || undefined,
      model: form.model.trim(),
      plate: form.plate.trim(),
      body: selectedBody.label,
      bodyCode: form.bodyCode,
      capacityKg: Math.round(capacityKg),
      volumeLiters: Math.round(volumeM3 * 1000),
      lengthMm: metresToMm(form.lengthM),
      widthMm: metresToMm(form.widthM),
      heightMm: metresToMm(form.heightM),
      year: year && Number.isFinite(year) ? Math.round(year) : null,
      photoUrl: form.photoUrl.trim() || null,
      status: form.status,
    };
  }

  async function saveVehicle(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    const payload = payloadFromForm();
    if (!payload) return;
    setBusy(true);
    const result = editingId ? await api.fleet.update(editingId, payload) : await api.fleet.create(payload);
    if (result.error) {
      setError(result.error.message);
    } else {
      setVehicles((current) =>
        editingId ? current.map((item) => (item.id === result.data.id ? result.data : item)) : [result.data, ...current],
      );
      setSuccess(editingId ? "Автомобиль обновлён." : "Автомобиль добавлен в автопарк.");
      setOpen(false);
    }
    setBusy(false);
  }

  async function addDriver(event: React.FormEvent) {
    event.preventDefault();
    if (teamBusy || !driverEmail.trim()) return;
    setError("");
    setSuccess("");
    setTeamBusy(true);
    const result = await api.drivers.addToTeam(driverEmail.trim());
    if (result.error) setError(result.error.message);
    else {
      setDrivers((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      setDriverEmail("");
      setSuccess("Водитель добавлен в команду.");
    }
    setTeamBusy(false);
  }

  async function removeDriver(driver: TeamDriver) {
    if (teamBusy) return;
    setError("");
    setSuccess("");
    setTeamBusy(true);
    const result = await api.drivers.removeFromTeam(driver.id);
    if (result.error) setError(result.error.message);
    else {
      setDrivers((current) => current.filter((item) => item.id !== driver.id));
      setSuccess("Водитель удалён из команды.");
    }
    setTeamBusy(false);
  }

  if (loading) return <div className="mx-auto max-w-7xl"><Card>Загружаем автопарк…</Card></div>;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={user?.role === "admin" ? "RohBar · администратор" : "RohBar · перевозчик"}
        title="Автопарк"
        description="Точные характеристики автомобилей используются для подбора груза, бронирования вместимости и назначения рейсов."
        action={<Button onClick={openCreate}><Plus size={17} />Добавить транспорт</Button>}
      />

      {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((vehicle) => {
          const fallback = bodyType(vehicle.bodyCode);
          return (
            <Card key={vehicle.id} className="overflow-hidden p-0 sm:p-0">
              <div className="relative aspect-[16/8] bg-slate-50">
                <Image src={vehicle.photoUrl || fallback.image} alt={`${vehicle.model} ${vehicle.plate}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
              </div>
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{vehicle.body}</p>
                    <h2 className="mt-1 text-lg font-black">{vehicle.model}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{vehicle.plate}{vehicle.year ? ` · ${vehicle.year}` : ""}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${vehicle.status === "maintenance" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {vehicle.status === "maintenance" ? "Обслуживание" : vehicle.status === "assigned" ? "Назначен" : "Доступен"}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Макс. вес" value={formatWeightKg(vehicle.capacityKg)} />
                  <Metric label="Полезный объём" value={formatVolumeLiters(vehicle.volumeLiters)} />
                  <div className="col-span-2"><Metric label="Внутренние размеры" value={formatDimensions(vehicle.lengthMm, vehicle.widthMm, vehicle.heightMm)} /></div>
                  {user?.role === "admin" && <div className="col-span-2"><Metric label="Перевозчик" value={vehicle.ownerName} /></div>}
                </div>
                <Button variant="secondary" className="mt-5 w-full" onClick={() => openEdit(vehicle)}><Edit3 size={16} />Изменить автомобиль</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {vehicles.length === 0 && <Card><p className="text-sm text-slate-500">Автопарк пока пуст. Добавьте первый автомобиль с точными характеристиками.</p></Card>}

      {user?.role === "carrier" && (
        <Card className="mt-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><UsersRound /></span>
            <div className="flex-1">
              <h2 className="font-black">Водители и команда</h2>
              <p className="mt-1 text-sm text-slate-500">Здесь реальные зарегистрированные водители вашей компании. Занятого водителя нельзя удалить до завершения рейса.</p>
            </div>
          </div>
          <form onSubmit={addDriver} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input className={inputClass} type="email" required value={driverEmail} onChange={(event) => setDriverEmail(event.target.value)} placeholder="email зарегистрированного водителя" />
            <Button type="submit" disabled={teamBusy}>{teamBusy ? "Добавление…" : "Добавить водителя"}</Button>
          </form>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {drivers.map((driver) => (
              <div key={driver.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-black">{driver.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{driver.email}{driver.phone ? ` · ${driver.phone}` : ""}</p>
                  <p className={`mt-2 text-xs font-bold ${driver.busy ? "text-amber-700" : "text-emerald-700"}`}>
                    {driver.busy ? `Занят${driver.currentShipmentId ? ` · ${driver.currentShipmentId}` : ""}` : "Свободен"}
                  </p>
                </div>
                <button type="button" disabled={teamBusy || driver.busy} onClick={() => void removeDriver(driver)} className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Удалить ${driver.name} из команды`}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
          {drivers.length === 0 && <p className="mt-5 text-sm text-slate-500">В команде пока нет водителей. Водитель должен сначала зарегистрироваться в RohBar с ролью «Водитель».</p>}
        </Card>
      )}

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-3 sm:p-6">
          <div className="mx-auto my-4 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-black">{editingId ? "Изменить автомобиль" : "Добавить автомобиль"}</h2><p className="mt-1 text-sm text-slate-500">Укажите реальные данные конкретной машины.</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть"><X /></button>
            </div>
            <form onSubmit={saveVehicle} className="mt-6 space-y-6">
              {user?.role === "admin" && !editingId && <Field label="Email перевозчика-владельца" required><input className={inputClass} required type="email" value={form.ownerEmail} onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))} placeholder="carrier@example.com" /></Field>}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Марка и модель" required><input className={inputClass} required minLength={2} value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="MAN TGX 18.510" /></Field>
                <Field label="Госномер" required><input className={inputClass} required minLength={4} value={form.plate} onChange={(event) => setForm((current) => ({ ...current, plate: event.target.value }))} placeholder="А123ВС 77" /></Field>
              </div>

              <div>
                <p className="mb-3 text-sm font-bold text-slate-700">Тип кузова *</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {vehicleBodyTypes.map((item) => (
                    <button key={item.code} type="button" onClick={() => setForm((current) => ({ ...current, bodyCode: item.code }))} className={`overflow-hidden rounded-2xl border text-left transition ${form.bodyCode === item.code ? "border-teal-600 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="relative aspect-[16/9] bg-slate-50"><Image src={item.image} alt={item.label} fill className="object-cover" sizes="220px" /></div>
                      <div className="p-3"><p className="text-sm font-black">{item.label}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{item.description}</p></div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Грузоподъёмность, кг" required><input className={inputClass} required type="number" min="100" max="200000" step="1" value={form.capacityKg} onChange={(event) => setForm((current) => ({ ...current, capacityKg: event.target.value }))} /></Field>
                <Field label="Полезный объём, м³" required><input className={inputClass} required type="number" min="0.1" max="500" step="0.1" value={form.volumeM3} onChange={(event) => setForm((current) => ({ ...current, volumeM3: event.target.value }))} /></Field>
                <Field label="Год выпуска"><input className={inputClass} type="number" min="1950" max="2100" value={form.year} onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))} placeholder="2024" /></Field>
                <Field label="Внутренняя длина, м"><input className={inputClass} type="number" min="0.1" max="50" step="0.01" value={form.lengthM} onChange={(event) => setForm((current) => ({ ...current, lengthM: event.target.value }))} /></Field>
                <Field label="Внутренняя ширина, м"><input className={inputClass} type="number" min="0.1" max="10" step="0.01" value={form.widthM} onChange={(event) => setForm((current) => ({ ...current, widthM: event.target.value }))} /></Field>
                <Field label="Внутренняя высота, м"><input className={inputClass} type="number" min="0.1" max="10" step="0.01" value={form.heightM} onChange={(event) => setForm((current) => ({ ...current, heightM: event.target.value }))} /></Field>
              </div>

              <Field label="Фото конкретного автомобиля (HTTPS URL)"><input className={inputClass} type="url" value={form.photoUrl} onChange={(event) => setForm((current) => ({ ...current, photoUrl: event.target.value }))} placeholder="https://.../truck.jpg" /></Field>
              <Field label="Состояние"><select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as VehicleStatus }))}><option value="available">Доступен</option><option value="maintenance">На обслуживании</option></select></Field>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Выбрано: <strong>{selectedBody.label}</strong> · {formatWeightKg(Number(form.capacityKg) || null)} · {form.volumeM3 || "—"} м³.</div>
              <Button type="submit" disabled={busy} className="w-full">{busy ? "Сохранение…" : editingId ? "Сохранить изменения" : "Добавить автомобиль"}<Save size={17} /></Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-semibold text-slate-700">{value}</p></div>;
}
