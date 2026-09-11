"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, FileWarning, MessageSquareText } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import type { NotificationItem } from "@/types";

const icons = {
  offer: Bell,
  shipment: CheckCircle2,
  document: FileWarning,
  system: MessageSquareText,
} as const;

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api.notifications.list().then((result) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setItems(result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);

  async function markAll() {
    if (!unread || busy) return;
    setBusy(true);
    setError("");
    const result = await api.notifications.readAll();
    if (result.error) setError(result.error.message);
    else setItems((current) => current.map((item) => ({ ...item, read: true })));
    setBusy(false);
  }

  async function markRead(id: string) {
    const current = items.find((item) => item.id === id);
    if (!current || current.read) return;
    const result = await api.notifications.read(id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setItems((value) => value.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="RohBar"
        title="Уведомления"
        description="События по заявкам, предложениям и перевозкам."
        action={
          unread ? (
            <Button variant="secondary" disabled={busy} onClick={markAll}>
              {busy ? "Обновление…" : "Отметить всё прочитанным"}
            </Button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <Card>
          <p className="text-sm font-semibold text-slate-500">Загружаем уведомления…</p>
        </Card>
      ) : items.length ? (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = icons[item.type] || Bell;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => void markRead(item.id)}
                className="block w-full text-left"
              >
                <Card className={!item.read ? "border-teal-200 bg-teal-50/20" : ""}>
                  <div className="flex gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                      <Icon size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-bold">{item.title}</h2>
                        {!item.read && <span className="mt-1 size-2.5 shrink-0 rounded-full bg-teal-600" />}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{item.text}</p>
                      <p className="mt-3 text-xs font-semibold text-slate-400">
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="font-bold">Уведомлений пока нет</p>
          <p className="mt-1 text-sm text-slate-500">Новые события RohBar появятся здесь.</p>
        </Card>
      )}
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
