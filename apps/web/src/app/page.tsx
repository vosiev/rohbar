"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, ShieldCheck, Truck, UserRound, Zap } from "lucide-react";
import { useMessages } from "@/lib/i18n-context";
import { commonMessages } from "@/lib/messages/common";

export default function Home() {
  const { m, text } = useMessages(commonMessages);
  return (
    <div className="mx-auto max-w-7xl">
      <section className="grid gap-8 py-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-16">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm font-semibold text-teal-800">
            <Zap size={15} /> {m("logistics")}
          </div>
          <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">{text("heroTitle")}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-600">{text("heroText")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-700 px-6 py-3.5 font-bold text-white"
            >
              {m("getStarted")} <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-6 py-3.5 font-bold"
            >
              {text("login")}
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-black uppercase tracking-[.18em] text-teal-700">{m("onePlatform")}</p>
          <h2 className="mt-2 text-2xl font-black">{m("participants")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {m("roleTools")}
          </p>
          <div className="mt-6 space-y-3">
            <RoleRow
              icon={<BriefcaseBusiness size={18} />}
              title={text("customer")}
              text={m("customerTools")}
            />
            <RoleRow
              icon={<Truck size={18} />}
              title={text("carrier")}
              text={m("carrierTools")}
            />
            <RoleRow
              icon={<UserRound size={18} />}
              title={m("driver")}
              text={m("driverTools")}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-12 sm:grid-cols-3">
        <Feature
          icon={<Truck />}
          title={m("liveData")}
          text={m("liveDataText")}
        />
        <Feature
          icon={<ShieldCheck />}
          title={m("roleAccess")}
          text={m("roleAccessText")}
        />
        <Feature
          icon={<Zap />}
          title={m("events")}
          text={m("eventsText")}
        />
      </section>
    </div>
  );
}

function RoleRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-teal-700">{icon}</span>
      <div>
        <p className="font-black">{title}</p>
        <p className="mt-1 text-sm leading-5 text-slate-500">{text}</p>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="mb-4 grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-500">{text}</p>
    </div>
  );
}
