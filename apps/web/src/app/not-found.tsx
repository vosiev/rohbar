"use client";

import { useMessages } from "@/lib/i18n-context";
import { commonMessages } from "@/lib/messages/common";

export default function NotFound() {
  const { m } = useMessages(commonMessages);
  return <main className="mx-auto max-w-xl py-24 text-center"><p className="text-sm font-bold text-teal-700">RohBar</p><h1 className="mt-2 text-6xl font-black">404</h1><p className="mt-4 text-gray-500">{m("notFound")}</p></main>;
}
