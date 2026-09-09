import type { ApiResult, DriverAssignment, FleetVehicle, NotificationItem, Shipment, ShipmentEvent, ShipmentOffer, User } from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
const mode = process.env.NEXT_PUBLIC_API_MODE || "live";

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      credentials: "include",
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        data: null,
        error: {
          code: String(body?.error?.code || response.status),
          message: String(body?.error?.message || "Request failed"),
        },
      };
    }
    return { data: body?.data ?? body, error: null };
  } catch (error) {
    return {
      data: null,
      error: { code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Network request failed" },
    };
  }
}

export const api = {
  auth: {
    me: async () => mode === "mock" ? { data: null, error: { code: "MOCK_DISABLED", message: "Mock authentication is disabled" } } : request<User>("/api/v1/auth/me"),
    login: async (email: string, password: string) => request<User>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    register: async (payload: { name: string; email: string; password: string; role: string; phone?: string }) => request<User>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) }),
    logout: async () => request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),
    telegram: async (initData: string) => request<User>("/api/v1/auth/telegram", { method: "POST", body: JSON.stringify({ init_data: initData }) }),
  },
  shipments: {
    list: async (query = "") => request<Shipment[]>(`/api/v1/shipments${query ? `?${query}` : ""}`),
    get: async (id: string) => request<Shipment>(`/api/v1/shipments/${id}`),
    create: async (payload: unknown) => request<Shipment>("/api/v1/shipments", { method: "POST", body: JSON.stringify(payload) }),
    status: async (id: string, status: string) => request<Shipment>(`/api/v1/shipments/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    events: async (id: string) => request<ShipmentEvent[]>(`/api/v1/shipments/${id}/events`),
  },
  offers: {
    list: async (shipmentId: string) => request<ShipmentOffer[]>(`/api/v1/shipments/${shipmentId}/offers`),
    create: async (shipmentId: string, payload: unknown) => request<ShipmentOffer>(`/api/v1/shipments/${shipmentId}/offers`, { method: "POST", body: JSON.stringify(payload) }),
    accept: async (id: string) => request<ShipmentOffer>(`/api/v1/offers/${id}/accept`, { method: "POST" }),
  },
  fleet: {
    list: async () => request<FleetVehicle[]>("/api/v1/fleet"),
    create: async (payload: Record<string, unknown>) => request<FleetVehicle>("/api/v1/fleet", { method: "POST", body: JSON.stringify(payload) }),
  },
  drivers: {
    list: async () => request<DriverAssignment[]>("/api/v1/drivers/assignments"),
    assign: async (shipmentId: string, payload: Record<string, unknown>) => request<DriverAssignment>(`/api/v1/shipments/${shipmentId}/driver`, { method: "POST", body: JSON.stringify(payload) }),
  },
  notifications: {
    list: async () => request<NotificationItem[]>("/api/v1/notifications"),
    read: async (id: string) => request<NotificationItem>(`/api/v1/notifications/${id}/read`, { method: "POST" }),
    readAll: async () => request<{ ok: boolean }>("/api/v1/notifications/read-all", { method: "POST" }),
  },
  health: async () => request<{ status: string }>("/api/v1/health"),
};
