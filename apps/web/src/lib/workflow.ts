import { statusLabel } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import type { Locale, ShipmentStatus, Role } from "@/types";

export type WorkflowAction = "publish" | "accept_offer" | "start_trip" | "mark_delivered" | "complete";

const transitions: Record<ShipmentStatus, Partial<Record<WorkflowAction, ShipmentStatus>>> = {
  published: { publish: "published", accept_offer: "accepted" },
  offered: { accept_offer: "accepted" },
  accepted: { start_trip: "in_transit" },
  in_transit: { mark_delivered: "delivered" },
  delivered: { complete: "completed" },
  completed: {},
  cancelled: {},
};

const permissions: Record<Role, WorkflowAction[]> = {
  customer: ["publish", "accept_offer", "complete"],
  carrier: ["accept_offer", "start_trip", "mark_delivered"],
  driver: ["start_trip", "mark_delivered"],
  admin: ["publish", "accept_offer", "start_trip", "mark_delivered", "complete"],
};

export function canRunAction(role: Role, status: ShipmentStatus, action: WorkflowAction) {
  return permissions[role].includes(action) && Boolean(transitions[status][action]);
}

export function nextStatus(status: ShipmentStatus, action: WorkflowAction): ShipmentStatus | null {
  return transitions[status][action] ?? null;
}

export function getStatusSteps(locale: Locale) {
  return (["published", "offered", "accepted", "in_transit", "delivered", "completed"] as const).map(key => ({
    key,
    label: key === "accepted" ? commonMessages.carrierSelected[locale] : statusLabel(key, locale),
  }));
}
