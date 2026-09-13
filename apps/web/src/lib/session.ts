import { t } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import type { Locale, Role } from "@/types";

const KEY = "rohbar-role";

export function getStoredRole(): Role {
  if (typeof window === "undefined") return "customer";
  const role = window.localStorage.getItem(KEY);
  return role === "carrier" || role === "driver" || role === "admin" ? role : "customer";
}

export function setStoredRole(role: Role) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, role);
}

export function roleLabel(role: Role, locale: Locale = "ru") {
  return ({
    customer: t(locale, "customer"),
    carrier: t(locale, "carrier"),
    driver: commonMessages.driver[locale],
    admin: commonMessages.administrator[locale],
  } satisfies Record<Role, string>)[role];
}
