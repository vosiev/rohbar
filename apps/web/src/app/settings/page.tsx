"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Languages, LogOut, Server, Send, ShieldCheck, UserRound } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { roleLabel, setStoredRole } from "@/lib/session";
import { useTelegram } from "@/lib/telegram";
import type { HealthStatus, NotificationItem, User } from "@/types";

type AboutStatus = {
  name: string;
  version: string;
  frontend_origin: string;
  realtime: string[];
  telegram: boolean;
};

export default function Settings() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const { isTelegram } = useTelegram();
  const [user, setUser] = useState<User | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [about, setAbout] = useState<AboutStatus | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.auth.me(),
      api.health(),
      api.about(),
      api.notifications.list(),
    ]).then(([userResult, healthResult, aboutResult, notificationResult]) => {
      if (!active) return;
      if (!userResult.error) setUser(userResult.data);
      if (!healthResult.error) setHealth(healthResult.data);
      if (!aboutResult.error) setAbout(aboutResult.data);
      if (!notificationResult.error) setNotifications(notificationResult.data);
      const firstError = [
        userResult.error?.message,
        healthResult.error?.message,
        aboutResult.error?.message,
        notificationResult.error?.message,
      ].find(Boolean);
      setError(firstError || "");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    const result = await api.auth.logout();
    if (result.error) {
      setError(result.error.message);
      setLoggingOut(false);
      return;
    }
    setStoredRole("customer");
    router.replace("/login");
  }

  const unread = notifications.filter((item) => !item.read).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="RohBar"
        title="Настройки"
        description="Реальные параметры аккаунта, языка, уведомлений и подключённых сервисов."
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <Card>Загружаем настройки из backend RohBar…</Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <SectionIcon icon={UserRound} />
            <h2 className="mt-4 text-lg font-black">Аккаунт</h2>
            <p className="mt-2 text-sm text-slate-500">{user?.name || "Пользователь"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{user?.email || "—"}</p>
            {user && <p className="mt-1 text-xs font-bold text-teal-700">{roleLabel(user.role)}</p>}
            <Button href="/profile" variant="secondary" className="mt-5 w-full">
              Изменить профиль и пароль
            </Button>
          </Card>

          <Card>
            <SectionIcon icon={Languages} />
            <h2 className="mt-4 text-lg font-black">Язык интерфейса</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Переключение применяется сразу к локализованным элементам интерфейса и сохраняется на этом устройстве.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <LanguageButton active={locale === "ru"} onClick={() => setLocale("ru")} label="Русский" />
              <LanguageButton active={locale === "tg"} onClick={() => setLocale("tg")} label="Тоҷикӣ" />
            </div>
          </Card>

          <Card>
            <SectionIcon icon={Bell} />
            <h2 className="mt-4 text-lg font-black">Уведомления</h2>
            <p className="mt-2 text-sm text-slate-500">Непрочитанных событий: {unread}</p>
            <p className="mt-1 text-sm text-slate-500">Всего событий: {notifications.length}</p>
            <Button href="/notifications" variant="secondary" className="mt-5 w-full">
              Открыть центр уведомлений
            </Button>
          </Card>

          <Card>
            <SectionIcon icon={Send} />
            <h2 className="mt-4 text-lg font-black">Telegram</h2>
            <StatusRow label="Backend-интеграция" ok={Boolean(about?.telegram)} />
            <StatusRow label="Открыто внутри Telegram Mini App" ok={isTelegram} />
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Статус берётся из backend-конфигурации RohBar и Telegram WebApp runtime, а не из статической заглушки.
            </p>
          </Card>

          <Card>
            <SectionIcon icon={Server} />
            <h2 className="mt-4 text-lg font-black">Система RohBar</h2>
            <StatusRow label="API" ok={health?.status === "ok"} />
            <StatusRow label="PostgreSQL" ok={Boolean(health?.database)} />
            <StatusRow label="Redis" ok={Boolean(health?.redis)} />
            <p className="mt-3 text-xs text-slate-400">Версия API: {about?.version || "—"}</p>
            <p className="mt-1 text-xs text-slate-400">Realtime: {about?.realtime.join(", ") || "—"}</p>
          </Card>

          <Card>
            <SectionIcon icon={ShieldCheck} />
            <h2 className="mt-4 text-lg font-black">Сессия</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Выход завершит текущую серверную сессию RohBar на этом устройстве.
            </p>
            <Button variant="secondary" className="mt-5 w-full" disabled={loggingOut} onClick={() => void logout()}>
              <LogOut size={17} /> {loggingOut ? "Выходим…" : "Выйти из аккаунта"}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function SectionIcon({ icon: Icon }: { icon: typeof UserRound }) {
  return (
    <span className="grid size-11 place-items-center rounded-2xl bg-teal-50 text-teal-700">
      <Icon size={21} />
    </span>
  );
}

function LanguageButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
        active ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <span className={`text-xs font-black ${ok ? "text-emerald-700" : "text-amber-700"}`}>
        {ok ? "Работает" : "Не активно"}
      </span>
    </div>
  );
}
