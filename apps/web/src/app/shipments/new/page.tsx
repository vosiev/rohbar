/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { ArrowLeft, Check, PackageOpen, Ruler, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import {
  bodyType,
  calculateVolumeLiters,
  formatDimensions,
  formatVolumeLiters,
  formatWeightKg,
  vehicleBodyTypes,
} from "@/lib/vehicles";
import type { AvailableVehicle, Shipment, VehicleBodyCode } from "@/types";

const steps = ["Маршрут", "Груз", "Автомобиль", "Дата и бюджет", "Проверка"];
type VolumeMode = "known" | "calculate" | "unknown";
type VehicleMode = "specific" | "marketplace";
type WeightUnit = "kg" | "t";

type Form = {
  from: string;
  to: string;
  cargo: string;
  weight: string;
  weightUnit: WeightUnit;
  volumeMode: VolumeMode;
  volumeM3: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  quantity: string;
  bodyCode: "" | VehicleBodyCode;
  vehicleMode: VehicleMode;
  selectedVehicleId: string;
  date: string;
  price: string;
};

const initialForm: Form = {
  from: "",
  to: "",
  cargo: "",
  weight: "",
  weightUnit: "kg",
  volumeMode: "unknown",
  volumeM3: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  quantity: "1",
  bodyCode: "",
  vehicleMode: "specific",
  selectedVehicleId: "",
  date: "",
  price: "",
};

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function NewShipmentPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initialForm);
  const [vehicles, setVehicles] = useState<AvailableVehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Shipment | null>(null);

  const weightKg = useMemo(() => {
    const value = numberValue(form.weight);
    if (value <= 0) return 0;
    return Math.round(form.weightUnit === "t" ? value * 1000 : value);
  }, [form.weight, form.weightUnit]);

  const calculatedVolumeLiters = useMemo(() => {
    if (form.volumeMode === "unknown") return null;
    if (form.volumeMode === "known") {
      const m3 = numberValue(form.volumeM3);
      return m3 > 0 ? Math.round(m3 * 1000) : null;
    }
    return calculateVolumeLiters(
      numberValue(form.lengthCm),
      numberValue(form.widthCm),
      numberValue(form.heightCm),
      Math.max(1, Math.round(numberValue(form.quantity))),
    );
  }, [form.heightCm, form.lengthCm, form.quantity, form.volumeM3, form.volumeMode, form.widthCm]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === form.selectedVehicleId) ?? null,
    [form.selectedVehicleId, vehicles],
  );

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(form.from.trim() && form.to.trim() && form.from.trim() !== form.to.trim());
    if (step === 1) {
      if (!form.cargo.trim() || weightKg <= 0) return false;
      return form.volumeMode === "unknown" || calculatedVolumeLiters !== null;
    }
    if (step === 2) return form.vehicleMode === "marketplace" || Boolean(form.selectedVehicleId);
    if (step === 3) return Boolean(form.date && form.price.trim());
    return true;
  }, [calculatedVolumeLiters, form, step, weightKg]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  useEffect(() => {
    if (step !== 2 || weightKg <= 0) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoadingVehicles(true);
      const result = await api.fleet.available({
        weightKg,
        volumeLiters: calculatedVolumeLiters || undefined,
        bodyCode: form.bodyCode || undefined,
      });
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        setVehicles([]);
      } else {
        setVehicles(result.data);
        if (form.selectedVehicleId && !result.data.some((vehicle) => vehicle.id === form.selectedVehicleId)) {
          setForm((current) => ({ ...current, selectedVehicleId: "" }));
        }
      }
      setLoadingVehicles(false);
    });
    return () => {
      active = false;
    };
  }, [calculatedVolumeLiters, form.bodyCode, form.selectedVehicleId, step, weightKg]);

  function next() {
    if (!stepValid) {
      setError("Заполните обязательные поля текущего шага.");
      return;
    }
    if (step === 0 && form.from.trim().toLocaleLowerCase("ru") === form.to.trim().toLocaleLowerCase("ru")) {
      setError("Город отправления и назначения должны отличаться.");
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function publish() {
    if (saving || !stepValid) return;
    setSaving(true);
    setError("");
    const result = await api.shipments.create({
      from: form.from.trim(),
      to: form.to.trim(),
      cargo: form.cargo.trim(),
      weightKg,
      volumeLiters: calculatedVolumeLiters,
      volumeEstimated: form.volumeMode === "calculate",
      bodyCode: form.bodyCode || null,
      selectedVehicleId: form.vehicleMode === "specific" ? form.selectedVehicleId : null,
      date: form.date,
      price: form.price.trim(),
    });
    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }
    setCreated(result.data);
    setSaving(false);
  }

  if (created) return <Success shipment={created} />;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/shipments"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Назад к перевозкам
      </Link>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">RohBar · новая заявка</p>
        <h1 className="mt-2 text-3xl font-black">Создать заявку</h1>
        <p className="mt-2 text-sm text-slate-500">
          Укажите груз, а RohBar покажет конкретные автомобили с реальным остатком вместимости.
        </p>
        <div className="mt-6 grid grid-cols-5 gap-2">
          {steps.map((label, index) => (
            <div key={label}>
              <div className={`h-1.5 rounded-full ${index <= step ? "bg-teal-700" : "bg-slate-200"}`} />
              <span className="mt-2 hidden text-[11px] font-bold text-slate-400 sm:block">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <Card className="mt-7">
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Откуда" required>
              <input
                className={inputClass}
                value={form.from}
                onChange={(event) => set("from", event.target.value)}
                placeholder="Москва"
                autoComplete="address-level2"
              />
            </Field>
            <Field label="Куда" required>
              <input
                className={inputClass}
                value={form.to}
                onChange={(event) => set("to", event.target.value)}
                placeholder="Казань"
                autoComplete="address-level2"
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Груз" required>
                <input
                  className={inputClass}
                  value={form.cargo}
                  onChange={(event) => set("cargo", event.target.value)}
                  placeholder="Строительные материалы"
                />
              </Field>
              <Field label="Вес" required>
                <div className="grid grid-cols-[1fr_92px] gap-2">
                  <input
                    className={inputClass}
                    type="number"
                    min="0.001"
                    step="0.001"
                    inputMode="decimal"
                    value={form.weight}
                    onChange={(event) => set("weight", event.target.value)}
                    placeholder={form.weightUnit === "t" ? "20" : "20000"}
                  />
                  <select className={inputClass} value={form.weightUnit} onChange={(event) => set("weightUnit", event.target.value as WeightUnit)}>
                    <option value="kg">кг</option>
                    <option value="t">тонн</option>
                  </select>
                </div>
              </Field>
            </div>
            <div>
              <p className="mb-3 text-sm font-bold text-slate-700">Объём груза</p>
              <div className="grid gap-3 md:grid-cols-3">
                <VolumeChoice
                  active={form.volumeMode === "known"}
                  title="Объём известен"
                  text="Укажите точный объём в м³."
                  onClick={() => set("volumeMode", "known")}
                />
                <VolumeChoice
                  active={form.volumeMode === "calculate"}
                  title="Рассчитать"
                  text="Введите размеры одного места и количество."
                  onClick={() => set("volumeMode", "calculate")}
                />
                <VolumeChoice
                  active={form.volumeMode === "unknown"}
                  title="Не знаю объём"
                  text="Подбор будет выполнен только по весу."
                  onClick={() => set("volumeMode", "unknown")}
                />
              </div>
            </div>

            {form.volumeMode === "known" && (
              <Field label="Объём, м³" required>
                <input className={inputClass} type="number" min="0.001" step="0.001" inputMode="decimal" value={form.volumeM3} onChange={(event) => set("volumeM3", event.target.value)} placeholder="12.5" />
              </Field>
            )}

            {form.volumeMode === "calculate" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Длина места, см" required>
                  <input className={inputClass} type="number" min="1" step="0.1" value={form.lengthCm} onChange={(event) => set("lengthCm", event.target.value)} />
                </Field>
                <Field label="Ширина, см" required>
                  <input className={inputClass} type="number" min="1" step="0.1" value={form.widthCm} onChange={(event) => set("widthCm", event.target.value)} />
                </Field>
                <Field label="Высота, см" required>
                  <input className={inputClass} type="number" min="1" step="0.1" value={form.heightCm} onChange={(event) => set("heightCm", event.target.value)} />
                </Field>
                <Field label="Количество" required>
                  <input className={inputClass} type="number" min="1" step="1" value={form.quantity} onChange={(event) => set("quantity", event.target.value)} />
                </Field>
                <div className="sm:col-span-2 lg:col-span-4 rounded-2xl bg-teal-50 p-4 text-sm text-teal-800">
                  <Ruler size={17} className="mr-2 inline" />
                  Расчётный объём: <strong>{formatVolumeLiters(calculatedVolumeLiters)}</strong>. Это приблизительное значение по габаритам мест.
                </div>
              </div>
            )}

            {form.volumeMode === "unknown" && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                Объём не обязателен. RohBar отфильтрует машины по весу, но окончательную совместимость по объёму должен подтвердить перевозчик.
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-bold text-slate-700">Предпочтительный тип кузова</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={() => set("bodyCode", "")}
                  className={`rounded-2xl border p-4 text-left transition ${!form.bodyCode ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <PackageOpen size={21} className="text-teal-700" />
                  <p className="mt-3 text-sm font-black">Любой подходящий</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Показывать все машины, где хватает вместимости.</p>
                </button>
                {vehicleBodyTypes.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => set("bodyCode", item.code)}
                    className={`rounded-2xl border p-4 text-left transition ${form.bodyCode === item.code ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <Truck size={21} className="text-teal-700" />
                    <p className="mt-3 text-sm font-black">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => set("vehicleMode", "specific")}
                className={`rounded-2xl border p-4 text-left transition ${form.vehicleMode === "specific" ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200"}`}
              >
                <p className="font-black">Выбрать конкретный автомобиль</p>
                <p className="mt-1 text-sm text-slate-500">RohBar сразу зарезервирует указанную вместимость этой машины.</p>
              </button>
              <button
                type="button"
                onClick={() => set("vehicleMode", "marketplace")}
                className={`rounded-2xl border p-4 text-left transition ${form.vehicleMode === "marketplace" ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200"}`}
              >
                <p className="font-black">Получить предложения перевозчиков</p>
                <p className="mt-1 text-sm text-slate-500">Заявка будет опубликована без предварительной брони конкретной машины.</p>
              </button>
            </div>

            {form.vehicleMode === "specific" && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-black">Доступные автомобили</h2>
                    <p className="mt-1 text-sm text-slate-500">Нужен вес {formatWeightKg(weightKg)}{calculatedVolumeLiters ? ` · объём ${formatVolumeLiters(calculatedVolumeLiters)}` : " · объём не указан"}.</p>
                  </div>
                  {loadingVehicles && <span className="text-sm font-semibold text-slate-400">Обновляем…</span>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {vehicles.map((vehicle) => (
                    <VehicleChoice
                      key={vehicle.id}
                      vehicle={vehicle}
                      selected={form.selectedVehicleId === vehicle.id}
                      onSelect={() => set("selectedVehicleId", vehicle.id)}
                    />
                  ))}
                </div>
                {!loadingVehicles && vehicles.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                    Подходящих автомобилей сейчас нет. Измените тип кузова либо выберите режим «Получить предложения перевозчиков».
                  </div>
                )}
              </div>
            )}

            {form.vehicleMode === "marketplace" && (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                Перевозчики увидят требуемый вес, объём и выбранный тип кузова и смогут предложить конкретную машину из своего автопарка.
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Дата погрузки" required>
              <input
                type="date"
                className={inputClass}
                value={form.date}
                onChange={(event) => set("date", event.target.value)}
              />
            </Field>
            <Field label="Бюджет" required>
              <input
                className={inputClass}
                value={form.price}
                onChange={(event) => set("price", event.target.value)}
                placeholder="85 000 ₽"
                inputMode="decimal"
              />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-lg font-black">Проверьте заявку</h2>
            <div className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
              <Summary label="Маршрут" value={`${form.from} → ${form.to}`} />
              <Summary label="Груз" value={`${form.cargo} · ${formatWeightKg(weightKg)}`} />
              <Summary label="Объём" value={calculatedVolumeLiters ? `${formatVolumeLiters(calculatedVolumeLiters)}${form.volumeMode === "calculate" ? " (расчётный)" : ""}` : "Не указан"} />
              <Summary label="Тип кузова" value={form.bodyCode ? bodyType(form.bodyCode).label : "Любой подходящий"} />
              <Summary
                label="Автомобиль"
                value={
                  form.vehicleMode === "specific" && selectedVehicle
                    ? `${selectedVehicle.plate} · ${selectedVehicle.model} · ${selectedVehicle.body}`
                    : "Подберёт перевозчик"
                }
              />
              <Summary label="Дата" value={form.date} />
              <Summary label="Бюджет" value={form.price} />
            </div>
            {form.vehicleMode === "specific" && selectedVehicle && (
              <div className="mt-4 rounded-2xl bg-teal-50 p-4 text-sm leading-6 text-teal-800">
                После публикации RohBar создаст предварительную бронь на {formatWeightKg(weightKg)}
                {calculatedVolumeLiters ? ` и ${formatVolumeLiters(calculatedVolumeLiters)}` : ""} в выбранном автомобиле.
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <Button variant="secondary" onClick={() => { setError(""); setStep((current) => current - 1); }}>
              Назад
            </Button>
          ) : (
            <span />
          )}
          {step < steps.length - 1 ? (
            <Button onClick={next}>Продолжить</Button>
          ) : (
            <Button disabled={saving} onClick={publish}>
              {saving ? "Публикация…" : "Опубликовать заявку"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function VolumeChoice({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${active ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300"}`}
    >
      <p className="font-black">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-bold">{value || "—"}</p>
    </div>
  );
}

function VehicleChoice({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: AvailableVehicle;
  selected: boolean;
  onSelect: () => void;
}) {
  const fallback = bodyType(vehicle.bodyCode);
  const freeVolume = vehicle.remainingVolumeLiters;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`overflow-hidden rounded-3xl border bg-white text-left transition ${
        selected ? "border-teal-600 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="aspect-[16/8] overflow-hidden bg-slate-50">
        <img
          src={vehicle.photoUrl || fallback.image}
          alt={`${vehicle.model} ${vehicle.plate}`}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{vehicle.body}</p>
            <h3 className="mt-1 font-black">{vehicle.model}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {vehicle.plate}{vehicle.year ? ` · ${vehicle.year}` : ""}
            </p>
          </div>
          {selected && <Check className="text-teal-700" size={20} />}
        </div>
        <p className="mt-3 text-xs text-slate-500">Перевозчик: {vehicle.carrierName}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <VehicleMetric label="Свободно по весу" value={formatWeightKg(vehicle.remainingWeightKg)} />
          <VehicleMetric label="Свободно по объёму" value={formatVolumeLiters(freeVolume)} />
          <div className="col-span-2">
            <VehicleMetric
              label="Внутренние размеры"
              value={formatDimensions(vehicle.lengthMm, vehicle.widthMm, vehicle.heightMm)}
            />
          </div>
        </div>
        {vehicle.pendingReservations > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
            Уже есть предварительных броней: {vehicle.pendingReservations}. Показанный остаток уже учитывает их.
          </div>
        )}
      </div>
    </button>
  );
}

function VehicleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-700">{value}</p>
    </div>
  );
}
function Success({ shipment }: { shipment: Shipment }) {
  return (
    <Card className="mx-auto mt-10 max-w-xl text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
        <Check size={30} />
      </div>
      <h1 className="mt-5 text-2xl font-black">Заявка опубликована</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {shipment.id} · {shipment.from} → {shipment.to}.
      </p>
      {shipment.selectedVehicleId ? (
        <p className="mt-3 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
          Вместимость выбранного автомобиля предварительно зарезервирована для этой заявки.
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Перевозчики смогут предложить подходящий автомобиль.</p>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button href={`/shipments/${shipment.id}`}>Открыть заявку</Button>
        <Button href="/shipments" variant="secondary">К перевозкам</Button>
      </div>
    </Card>
  );
}
