"use client";

import { TelegramAccountLink } from "@/components/telegram-account-link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Languages, LogOut, Server, Send, ShieldCheck, UserRound } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { accountMessages } from "@/lib/messages/account";
import { formatError } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { useI18n, useMessages } from "@/lib/i18n-context";
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
  const { m, locale } = useMessages(accountMessages);
  const router = useRouter();
  const { setLocale } = useI18n();
  const { isTelegram } = useTelegram();
  const [user, setUser] = useState<User | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [about, setAbout] = useState<AboutStatus | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<ApiError | string>("");

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
        userResult.error,
        healthResult.error,
        aboutResult.error,
        notificationResult.error,
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
      setError(result.error);
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
        title={m("settings")}
        description={m("settingsDescription")}
      />

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formatError(error, locale)}
        </p>
      )}

      {loading ? (
        <Card>{m("loadingSettings")}</Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <SectionIcon icon={UserRound} />
            <h2 className="mt-4 text-lg font-black">{m("account")}</h2>
            <p className="mt-2 text-sm text-slate-500">{user?.name || m("user")}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{user?.email || "—"}</p>
            {user && <p className="mt-1 text-xs font-bold text-teal-700">{roleLabel(user.role, locale)}</p>}
            <Button href="/profile" variant="secondary" className="mt-5 w-full">
              {m("editProfilePassword")}
            </Button>
          </Card>

          <Card>
            <SectionIcon icon={Languages} />
            <h2 className="mt-4 text-lg font-black">{m("interfaceLanguage")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {m("languageDescription")}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <LanguageButton active={locale === "ru"} onClick={() => setLocale("ru")} label="Русский" />
              <LanguageButton active={locale === "tg"} onClick={() => setLocale("tg")} label="Тоҷикӣ" />
            </div>
          </Card>

          <Card>
            <SectionIcon icon={Bell} />
            <h2 className="mt-4 text-lg font-black">{m("notifications")}</h2>
            <p className="mt-2 text-sm text-slate-500">{m("unreadCount", { count: unread })}</p>
            <p className="mt-1 text-sm text-slate-500">{m("eventCount", { count: notifications.length })}</p>
            <Button href="/notifications" variant="secondary" className="mt-5 w-full">
              {m("openNotifications")}
            </Button>
          </Card>

          <Card>
            <SectionIcon icon={Send} />
            <h2 className="mt-4 text-lg font-black">Telegram</h2>
            <StatusRow label={m("telegramIntegration")} ok={Boolean(about?.telegram)} />
            <StatusRow label={m("insideTelegram")} ok={isTelegram} />
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {m("telegramStatusDescription")}
            </p>
            {user && <TelegramAccountLink key={user.id} />}
          </Card>

          <Card>
            <SectionIcon icon={Server} />
            <h2 className="mt-4 text-lg font-black">{m("system")}</h2>
            <StatusRow label="API" ok={health?.status === "ok"} />
            <StatusRow label="PostgreSQL" ok={Boolean(health?.database)} />
            <StatusRow label="Redis" ok={Boolean(health?.redis)} />
            <p className="mt-3 text-xs text-slate-400">{m("apiVersion", { version: about?.version || "—" })}</p>
            <p className="mt-1 text-xs text-slate-400">{m("realtime", { protocols: about?.realtime.join(", ") || "—" })}</p>
          </Card>

          <Card>
            <SectionIcon icon={ShieldCheck} />
            <h2 className="mt-4 text-lg font-black">{m("session")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {m("logoutDescription")}
            </p>
            <Button variant="secondary" className="mt-5 w-full" disabled={loggingOut} onClick={() => void logout()}>
              <LogOut size={17} /> {loggingOut ? m("loggingOut") : m("logout")}
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
  const { m } = useMessages(accountMessages);
  return (
    <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <span className={`text-xs font-black ${ok ? "text-emerald-700" : "text-amber-700"}`}>
        {ok ? m("working") : m("inactive")}
      </span>
    </div>
  );
}
