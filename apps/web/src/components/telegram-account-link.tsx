"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { formatDate, formatError } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n-context";
import { accountMessages } from "@/lib/messages/account";
import { activeLinkCode, type TelegramLinkCode, type TelegramLinkStatus } from "@/lib/telegram-link";
import type { ApiError } from "@/types/api";

export function TelegramAccountLink() {
  const { m, locale } = useMessages(accountMessages);
  const [status, setStatus] = useState<TelegramLinkStatus | null>(null);
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<"telegramUnlinkedDone" | "telegramLinkedDone" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [expired, setExpired] = useState(false);
  const generation = useRef(0);
  const mutation = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const unlinkButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.visibilityState === "hidden" || mutation.current) return;
      const version = generation.current;
      const result = await api.telegramLink.status();
      if (!active || version !== generation.current || mutation.current) return;
      if (result.error) { setError(result.error); return; }
      setStatus(result.data);
      setError(null);
      if (result.data.telegram_id !== null) {
        setCode(null);
        setExpired(false);
        if (code) setNotice("telegramLinkedDone");
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (code && !activeLinkCode(code, Date.now())) { setCode(null); setExpired(true); }
      void refresh();
    }, code ? 5000 : 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [code]);

  useEffect(() => {
    if (!code) return;
    const timer = window.setTimeout(() => { setCode(null); setExpired(true); }, Math.max(0, Date.parse(code.expires_at) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [code]);

  useEffect(() => { if (confirm) cancelButton.current?.focus(); }, [confirm]);

  async function generate() {
    if (mutation.current) return;
    mutation.current = true;
    generation.current += 1;
    setBusy(true); setError(null); setCode(null); setNotice(null); setExpired(false);
    const result = await api.telegramLink.issue();
    if (result.error) setError(result.error);
    else setCode(activeLinkCode(result.data, Date.now()));
    mutation.current = false;
    setBusy(false);
  }

  async function unlink() {
    if (mutation.current) return;
    mutation.current = true;
    generation.current += 1;
    setBusy(true); setError(null); setCode(null); setNotice(null);
    const result = await api.telegramLink.unlink();
    if (result.error) setError(result.error);
    else { setStatus(result.data); setConfirm(false); setNotice("telegramUnlinkedDone"); }
    mutation.current = false;
    setBusy(false);
  }

  function cancel() { setConfirm(false); unlinkButton.current?.focus(); }

  return <div className="mt-4 border-t border-slate-100 pt-4" aria-busy={busy}>
    <p className="text-sm font-bold">{status ? (status.telegram_id !== null ? m("telegramLinked") : m("telegramUnlinked")) : m("telegramChecking")}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{formatError(error, locale)}</p>}
    <p role="status" className="mt-2 text-sm text-teal-800">{notice ? m(notice) : expired ? m("telegramCodeExpired") : ""}</p>
    {status?.telegram_id !== null && status ? <>
      <p className="mt-2 break-all text-xs text-slate-500">Telegram ID: {status.telegram_id}</p>
      {status.can_unlink ? <>
        <button ref={unlinkButton} type="button" disabled={busy || confirm} onClick={() => setConfirm(true)} className="mt-3 min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold disabled:opacity-50">{m("telegramUnlink")}</button>
        {confirm && <div role="group" aria-labelledby="telegram-unlink-confirm" className="mt-3 rounded-xl bg-amber-50 p-3" onKeyDown={event => { if (event.key === "Escape" && !busy) cancel(); }}>
          <p id="telegram-unlink-confirm" className="text-sm">{m("telegramUnlinkConfirm")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button ref={cancelButton} type="button" disabled={busy} onClick={cancel} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">{m("telegramCancel")}</button>
            <Button disabled={busy} onClick={() => void unlink()}>{busy ? m("telegramWorking") : m("telegramUnlink")}</Button>
          </div>
        </div>}
      </> : <p className="mt-3 text-sm text-slate-600">{m("telegramAlternativeRequired")}</p>}
    </> : status ? <>
      <p className="mt-2 text-sm leading-6 text-slate-600">{m("telegramLinkInstructions")}</p>
      {code && <div className="mt-3 rounded-xl bg-teal-50 p-4" role="status">
        <p className="text-xs font-bold">{m("telegramCode")}</p>
        <code className="mt-2 block select-all break-all text-2xl font-black tracking-wider">/link {code.code}</code>
        <p className="mt-2 text-xs">{m("telegramCodeExpiry", { time: formatDate(code.expires_at, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}</p>
      </div>}
      <Button className="mt-3 w-full" disabled={busy} onClick={() => void generate()}>{busy ? m("telegramWorking") : code ? m("telegramRegenerate") : m("telegramGenerate")}</Button>
    </> : null}
  </div>;
}
