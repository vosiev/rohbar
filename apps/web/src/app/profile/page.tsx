"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/session";
import type { User } from "@/types";

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api.auth.me().then((result) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setUser(result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>Загружаем профиль…</Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <h1 className="text-xl font-black">Профиль недоступен</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "Не удалось загрузить пользователя."}</p>
        </Card>
      </div>
    );
  }

  const initial = user.name.trim().charAt(0).toLocaleUpperCase("ru") || "R";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="RohBar" title="Профиль" description="Данные текущего аккаунта RohBar." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <div className="flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-full bg-teal-50 text-xl font-black text-teal-700">
              {initial}
            </div>
            <div>
              <h2 className="font-black">{user.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{roleLabel(user.role)}</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <div className="flex gap-2 font-bold text-emerald-800">
              <ShieldCheck size={18} />
              Сессия активна
            </div>
            <p className="mt-1 text-sm leading-5 text-emerald-700">
              Личность и роль подтверждены backend-сессией RohBar.
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <UserRound size={18} className="text-teal-700" />
            <h2 className="font-black">Данные аккаунта</h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ProfileField label="Имя" value={user.name} />
            <ProfileField label="Телефон" value={user.phone || "Не указан"} />
            <ProfileField label="Роль" value={roleLabel(user.role)} />
            <ProfileField label="ID" value={user.id} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}
