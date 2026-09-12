import type { Role } from "@/types";

const KEY = "rohbar-role";

export function getStoredRole(): Role {
  if (typeof window === "undefined") return "customer";
  const role = window.localStorage.getItem(KEY);
  return role === "carrier" || role === "driver" || role === "admin" ? role : "customer";
}

export function setStoredRole(role: Role) {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, role);
}

export function roleLabel(role: Role) {
  return ({
    customer: "Заказчик",
    carrier: "Перевозчик",
    driver: "Водитель",
    admin: "Администратор",
  } satisfies Record<Role, string>)[role];
}
