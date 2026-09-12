"use client";

import { KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/session";
import type { User } from "@/types";

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void api.auth.me().then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
      } else {
        setUser(result.data);
        setName(result.data.name);
        setEmail(result.data.email);
        setPhone(result.data.phone || "");
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!user || profileBusy) return;
    setError("");
    setSuccess("");
    if (name.trim().length < 2) {
      setError("ФИО должно содержать минимум 2 символа.");
      return;
    }
    if (email.trim().toLowerCase() !== user.email.toLowerCase() && !currentPasswordForEmail) {
      setError("Для изменения email укажите текущий пароль.");
      return;
    }
    setProfileBusy(true);
    const result = await api.auth.updateProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      currentPassword: currentPasswordForEmail || undefined,
    });
    if (result.error) {
      setError(result.error.message);
    } else {
      setUser(result.data);
      setName(result.data.name);
      setEmail(result.data.email);
      setPhone(result.data.phone || "");
      setCurrentPasswordForEmail("");
      setSuccess("Данные профиля сохранены.");
    }
    setProfileBusy(false);
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    setError("");
    setSuccess("");
    if (newPassword.length < 15) {
      setError("Новый пароль должен содержать минимум 15 символов.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Новые пароли не совпадают.");
      return;
    }
    setPasswordBusy(true);
    const result = await api.auth.updatePassword(currentPassword, newPassword);
    if (result.error) {
      setError(result.error.message);
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Пароль успешно изменён.");
    }
    setPasswordBusy(false);
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl"><Card>Загружаем профиль…</Card></div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <h1 className="text-xl font-black">Профиль недоступен</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "Не удалось загрузить пользователя."}</p>
        </Card>
      </div>
    );
  }

  const initial = user.name.trim().charAt(0).toLocaleUpperCase("ru") || "R";
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="RohBar" title="Профиль" description="Личные данные, контакты и безопасность аккаунта." />

      {error && <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {success && <p role="status" className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p>}

      <div className="grid gap-6 lg:grid-cols-[.8fr_1.4fr]">
        <Card>
          <div className="flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-full bg-teal-50 text-xl font-black text-teal-700">{initial}</div>
            <div>
              <h2 className="font-black">{user.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{roleLabel(user.role)}</p>
              <p className="mt-1 text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <div className="flex gap-2 font-bold text-emerald-800"><ShieldCheck size={18} />Сессия активна</div>
            <p className="mt-1 text-sm leading-5 text-emerald-700">Данные аккаунта подтверждены backend-сессией RohBar.</p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-2"><UserRound size={18} className="text-teal-700" /><h2 className="font-black">Личные данные</h2></div>
            <form onSubmit={saveProfile} className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="ФИО" required>
                <input className={inputClass} required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Телефон">
                <input className={inputClass} type="tel" maxLength={32} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 900 000-00-00" />
              </Field>
              <Field label="Email" required>
                <input className={inputClass} required type="email" maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
              {emailChanged && (
                <Field label="Текущий пароль для смены email" required>
                  <input className={inputClass} required type="password" autoComplete="current-password" value={currentPasswordForEmail} onChange={(event) => setCurrentPasswordForEmail(event.target.value)} />
                </Field>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={profileBusy}>{profileBusy ? "Сохранение…" : "Сохранить профиль"}<Save size={17} /></Button>
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2"><KeyRound size={18} className="text-teal-700" /><h2 className="font-black">Изменить пароль</h2></div>
            <p className="mt-2 text-sm text-slate-500">Новый пароль должен содержать от 15 до 128 символов.</p>
            <form onSubmit={savePassword} className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Текущий пароль" required>
                  <input className={inputClass} required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </Field>
              </div>
              <Field label="Новый пароль" required>
                <input className={inputClass} required minLength={15} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </Field>
              <Field label="Повторите новый пароль" required>
                <input className={inputClass} required minLength={15} maxLength={128} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
              <div className="sm:col-span-2"><Button type="submit" disabled={passwordBusy}>{passwordBusy ? "Изменение…" : "Изменить пароль"}<KeyRound size={17} /></Button></div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
