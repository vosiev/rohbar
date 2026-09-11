"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Plus,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, PageHeader, StatCard, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/session";
import type { HealthStatus, NotificationItem, Shipment, User } from "@/types";

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fleetCount, setFleetCount] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const userResult = await api.auth.me();
      if (!active) return;
      if (userResult.error) {
        setError(userResult.error.message);
        setLoading(false);
        return;
      }

      setUser(userResult.data);
      const [shipmentsResult, notificationsResult] = await Promise.all([
        api.shipments.list(),
        api.notifications.list(),
      ]);
      if (!active) return;

      if (shipmentsResult.error) setError(shipmentsResult.error.message);
      else setShipments(shipmentsResult.data);
      if (!notificationsResult.error) setNotifications(notificationsResult.data);

      if (userResult.data.role === "carrier" || userResult.data.role === "admin") {
        const fleetResult = await api.fleet.list();
        if (active && !fleetResult.error) setFleetCount(fleetResult.data.length);
      }

      if (userResult.data.role === "admin") {
        const healthResult = await api.health();
        if (active && !healthResult.error) setHealth(healthResult.data);
      }

      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const active = shipments.filter((item) => !["delivered", "completed"].includes(item.status)).length;
    const pending = shipments.filter((item) => ["published", "offered"].includes(item.status)).length;
    const finished = shipments.filter((item) => ["delivered", "completed"].includes(item.status)).length;
    const unread = notifications.filter((item) => !item.read).length;
    return { active, pending, finished, unread };
  }, [notifications, shipments]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <Card>
          <p className="text-sm font-semibold text-slate-500">Загружаем кабинет…</p>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <h1 className="text-xl font-black">Кабинет недоступен</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "Не удалось получить текущую сессию."}</p>
          <Button href="/login" className="mt-5">Войти</Button>
        </Card>
      </div>
    );
  }

  const carrier = user.role === "carrier";
  const driver = user.role === "driver";
  const admin = user.role === "admin";
  const latestShipments = shipments.slice(0, 5);
  const latestNotifications = notifications.slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={`RohBar · ${roleLabel(user.role)}`}
        title={carrier ? "Кабинет перевозчика" : driver ? "Мои рейсы" : admin ? "Центр управления" : "Обзор"}
        description={
          carrier
            ? "Актуальные загрузки, автопарк и принятые перевозки."
            : driver
              ? "Назначенные рейсы и текущие статусы доставки."
              : admin
                ? "Состояние платформы и операционных процессов RohBar."
                : "Ваши заявки, предложения и текущие перевозки."
        }
        action={
          driver || admin ? undefined : (
            <Button href={carrier ? "/carrier/shipments" : "/shipments/new"}>
              <Plus size={18} />
              {carrier ? "Найти загрузку" : "Создать заявку"}
            </Button>
          )
        }
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Truck} label={driver ? "Назначенные рейсы" : "Активные перевозки"} value={String(metrics.active)} />
        <StatCard icon={Clock3} label={carrier ? "Доступны к работе" : "На рассмотрении"} value={String(metrics.pending)} />
        <StatCard icon={CheckCircle2} label="Завершено" value={String(metrics.finished)} />
        {admin ? (
          <StatCard
            icon={Activity}
            label="Состояние API"
            value={health?.status === "ok" ? "OK" : health?.status === "degraded" ? "Degraded" : "—"}
          />
        ) : carrier ? (
          <StatCard icon={PackageCheck} label="Транспорт в автопарке" value={fleetCount === null ? "—" : String(fleetCount)} />
        ) : (
          <StatCard icon={Bell} label="Непрочитанные" value={String(metrics.unread)} />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">
                {carrier ? "Доступные и активные заявки" : driver ? "Назначенные рейсы" : "Последние перевозки"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">Данные из backend RohBar</p>
            </div>
            <Link href="/shipments" className="text-sm font-bold text-teal-700">
              Все <ArrowUpRight size={15} className="inline" />
            </Link>
          </div>

          {latestShipments.length ? (
            <div className="mt-4 divide-y divide-slate-100">
              {latestShipments.map((item) => (
                <Link
                  key={item.id}
                  href={`/shipments/${item.id}`}
                  className="flex flex-col gap-3 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
                      <span>{item.id}</span>
                      <span>·</span>
                      <span>{item.date}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 font-black">{item.from} → {item.to}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.cargo} · {item.weight}</p>
                  </div>
                  <p className="text-base font-black">{item.price}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">Для вашей роли пока нет перевозок.</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">Уведомления</h2>
              <p className="mt-1 text-sm text-slate-500">Последние события аккаунта</p>
            </div>
            <Bell size={19} className="text-slate-400" />
          </div>
          {latestNotifications.length ? (
            <div className="mt-5 space-y-3">
              {latestNotifications.map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-50 p-4 text-sm leading-5">
                  <p className="font-bold">{item.title}</p>
                  <p className="mt-1 text-slate-500">{item.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">Новых уведомлений пока нет.</p>
          )}
          <Button href="/notifications" variant="secondary" className="mt-5 w-full">
            Все уведомления
          </Button>
        </Card>
      </div>
    </div>
  );
}
