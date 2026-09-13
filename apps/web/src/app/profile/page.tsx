"use client";

import { KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Field, PageHeader, inputClass } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { accountMessages } from "@/lib/messages/account";
import { formatError } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import { useMessages } from "@/lib/i18n-context";
import { roleLabel } from "@/lib/session";
import type { User } from "@/types";

export default function Profile() {
  const { m, locale } = useMessages(accountMessages);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | keyof typeof accountMessages | "">("");
  const [success, setSuccess] = useState<keyof typeof accountMessages | "">("");
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
        setError(result.error);
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
      setError("nameTooShort");
      return;
    }
    if (email.trim().toLowerCase() !== user.email.toLowerCase() && !currentPasswordForEmail) {
      setError("emailPasswordRequired");
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
      setError(result.error);
    } else {
      setUser(result.data);
      setName(result.data.name);
      setEmail(result.data.email);
      setPhone(result.data.phone || "");
      setCurrentPasswordForEmail("");
      setSuccess("profileSaved");
    }
    setProfileBusy(false);
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    setError("");
    setSuccess("");
    if (newPassword.length < 15) {
      setError("newPasswordTooShort");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("passwordMismatch");
      return;
    }
    setPasswordBusy(true);
    const result = await api.auth.updatePassword(currentPassword, newPassword);
    if (result.error) {
      setError(result.error);
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("passwordSaved");
    }
    setPasswordBusy(false);
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl"><Card>{m("loadingProfile")}</Card></div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-5xl">
        <Card>
          <h1 className="text-xl font-black">{m("profileUnavailable")}</h1>
          <p className="mt-2 text-sm text-slate-500">{error ? formatError(error, locale) : m("userUnavailable")}</p>
        </Card>
      </div>
    );
  }

  const initial = user.name.trim().charAt(0).toLocaleUpperCase(locale) || "R";
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="RohBar" title={m("profile")} description={m("profileDescription")} />

      {error && <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{typeof error === "string" ? m(error) : formatError(error, locale)}</p>}
      {success && <p role="status" className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{m(success)}</p>}

      <div className="grid gap-6 lg:grid-cols-[.8fr_1.4fr]">
        <Card>
          <div className="flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-full bg-teal-50 text-xl font-black text-teal-700">{initial}</div>
            <div>
              <h2 className="font-black">{user.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{roleLabel(user.role, locale)}</p>
              <p className="mt-1 text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <div className="flex gap-2 font-bold text-emerald-800"><ShieldCheck size={18} />{m("sessionActive")}</div>
            <p className="mt-1 text-sm leading-5 text-emerald-700">{m("sessionVerified")}</p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-2"><UserRound size={18} className="text-teal-700" /><h2 className="font-black">{m("personalData")}</h2></div>
            <form onSubmit={saveProfile} className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label={m("fullName")} required>
                <input className={inputClass} required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label={m("phone")}>
                <input className={inputClass} type="tel" maxLength={32} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 900 000-00-00" />
              </Field>
              <Field label={m("email")} required>
                <input className={inputClass} required type="email" maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
              {emailChanged && (
                <Field label={m("emailCurrentPassword")} required>
                  <input className={inputClass} required type="password" autoComplete="current-password" value={currentPasswordForEmail} onChange={(event) => setCurrentPasswordForEmail(event.target.value)} />
                </Field>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={profileBusy}>{profileBusy ? m("saving") : m("saveProfile")}<Save size={17} /></Button>
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2"><KeyRound size={18} className="text-teal-700" /><h2 className="font-black">{m("changePassword")}</h2></div>
            <p className="mt-2 text-sm text-slate-500">{m("newPasswordHelp")}</p>
            <form onSubmit={savePassword} className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={m("currentPassword")} required>
                  <input className={inputClass} required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </Field>
              </div>
              <Field label={m("newPassword")} required>
                <input className={inputClass} required minLength={15} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </Field>
              <Field label={m("confirmPassword")} required>
                <input className={inputClass} required minLength={15} maxLength={128} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
              <div className="sm:col-span-2"><Button type="submit" disabled={passwordBusy}>{passwordBusy ? m("changing") : m("changePassword")}<KeyRound size={17} /></Button></div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
