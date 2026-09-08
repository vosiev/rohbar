import type { ShipmentStatus, Role } from "@/types";

export type WorkflowAction = "publish" | "accept_offer" | "start_trip" | "mark_delivered" | "complete";

const transitions: Record<ShipmentStatus, Partial<Record<WorkflowAction, ShipmentStatus>>> = {
  published: { publish: "published", accept_offer: "accepted" },
  offered: { accept_offer: "accepted" },
  accepted: { start_trip: "in_transit" },
  in_transit: { mark_delivered: "delivered" },
  delivered: { complete: "completed" },
  completed: {},
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

export const statusSteps: { key: ShipmentStatus; label: string }[] = [
  { key: "published", label: "Опубликована" },
  { key: "offered", label: "Предложения" },
  { key: "accepted", label: "Перевозчик выбран" },
  { key: "in_transit", label: "В пути" },
  { key: "delivered", label: "Доставлена" },
  { key: "completed", label: "Завершена" },
];