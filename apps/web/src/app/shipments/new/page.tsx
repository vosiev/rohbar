"use client";

import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { Shipment } from "@/types";

const steps = ["Маршрут", "Груз", "Транспорт", "Дата и бюджет", "Проверка"];

type Form = {
  from: string;
  to: string;
  cargo: string;
  weight: string;
  vehicle: string;
  date: string;
  price: string;
};

const initialForm: Form = {
  from: "",
  to: "",
  cargo: "",
  weight: "",
  vehicle: "",
  date: "",
  price: "",
};

export default function NewShipmentPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Shipment | null>(null);

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(form.from.trim() && form.to.trim());
    if (step === 1) return Boolean(form.cargo.trim() && form.weight.trim());
    if (step === 2) return Boolean(form.vehicle.trim());
    if (step === 3) return Boolean(form.date && form.price.trim());
    return true;
  }, [form, step]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function next() {
    if (!stepValid) {
      setError("Заполните обязательные поля текущего шага.");
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function publish() {
    if (saving) return;
    setSaving(true);
    setError("");

    const result = await api.shipments.create({
      from: form.from.trim(),
      to: form.to.trim(),
      cargo: form.cargo.trim(),
      weight: form.weight.trim(),
      vehicle: form.vehicle.trim(),
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
    <div className="mx-auto max-w-3xl">
      <Link
        href="/shipments"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Назад к перевозкам
      </Link>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">
          RohBar · новая заявка
        </p>
        <h1 className="mt-2 text-3xl font-black">Создать заявку</h1>
        <div className="mt-6 grid grid-cols-5 gap-2">
          {steps.map((label, index) => (
            <div key={label}>
              <div
                className={`h-1.5 rounded-full ${index <= step ? "bg-teal-700" : "bg-slate-200"}`}
              />
              <span className="mt-2 hidden text-[11px] font-bold text-slate-400 sm:block">
                {label}
              </span>
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
              <input
                className={inputClass}
                value={form.weight}
                onChange={(event) => set("weight", event.target.value)}
                placeholder="20 т"
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <Field label="Требуемый транспорт" required>
            <select
              className={inputClass}
              value={form.vehicle}
              onChange={(event) => set("vehicle", event.target.value)}
            >
              <option value="">Выберите транспорт</option>
              <option value="Тент 20 т">Тент 20 т</option>
              <option value="Фура 20 т">Фура 20 т</option>
              <option value="Рефрижератор">Рефрижератор</option>
              <option value="Газель">Газель</option>
            </select>
          </Field>
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
              <Summary label="Груз" value={`${form.cargo} · ${form.weight}`} />
              <Summary label="Транспорт" value={form.vehicle} />
              <Summary label="Дата" value={form.date} />
              <Summary label="Бюджет" value={form.price} />
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">
              Заявка будет сохранена в RohBar и станет доступна перевозчикам после публикации.
            </p>
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-bold">{value || "—"}</p>
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
        {shipment.id} · {shipment.from} → {shipment.to}. Данные сохранены в backend RohBar.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button href={`/shipments/${shipment.id}`}>Открыть заявку</Button>
        <Button href="/shipments" variant="secondary">К перевозкам</Button>
      </div>
    </Card>
  );
}
