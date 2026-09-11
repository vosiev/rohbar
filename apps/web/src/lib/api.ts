import type {
  ApiResult,
  DriverAssignment,
  FleetVehicle,
  HealthStatus,
  NotificationItem,
  OfferStatus,
  Shipment,
  ShipmentEvent,
  ShipmentOffer,
  User,
  VehicleStatus,
} from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") || "";

type WireOffer = {
  id: string;
  shipment_id: string;
  carrier_id: string;
  carrier_name: string;
  vehicle: string;
  price: string;
  eta: string;
  status: OfferStatus;
};

type WireFleetVehicle = {
  id: string;
  plate: string;
  model: string;
  body: string;
  capacity: string;
  volume: string;
  status: VehicleStatus;
  driver_name?: string | null;
};

type WireDriverAssignment = {
  shipment_id: string;
  driver_id: string;
  driver_name: string;
  phone?: string | null;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
};

type WireShipmentEvent = {
  id: string;
  shipment_id: string;
  event: string;
  actor_id: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const headers = new Headers(init?.headers);
    if (typeof init?.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
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
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network request failed",
      },
    };
  }
}

function mapResult<TWire, TDomain>(
  result: ApiResult<TWire>,
  transform: (value: TWire) => TDomain,
): ApiResult<TDomain> {
  if (result.error) return result;
  return { data: transform(result.data), error: null };
}

function mapOffer(value: WireOffer): ShipmentOffer {
  return {
    id: value.id,
    shipmentId: value.shipment_id,
    carrierId: value.carrier_id,
    carrierName: value.carrier_name,
    vehicle: value.vehicle,
    price: value.price,
    eta: value.eta,
    status: value.status,
  };
}

function mapFleetVehicle(value: WireFleetVehicle): FleetVehicle {
  return {
    id: value.id,
    plate: value.plate,
    model: value.model,
    body: value.body,
    capacity: value.capacity,
    volume: value.volume,
    status: value.status,
    driverName: value.driver_name,
  };
}

function mapDriverAssignment(value: WireDriverAssignment): DriverAssignment {
  return {
    shipmentId: value.shipment_id,
    driverId: value.driver_id,
    driverName: value.driver_name,
    phone: value.phone,
    vehicleId: value.vehicle_id,
    vehiclePlate: value.vehicle_plate,
  };
}

function mapShipmentEvent(value: WireShipmentEvent): ShipmentEvent {
  return {
    id: value.id,
    shipmentId: value.shipment_id,
    event: value.event,
    actorId: value.actor_id,
    payload: value.payload,
    occurredAt: value.occurred_at,
  };
}

function resource(path: string, id: string, suffix = "") {
  return `${path}/${encodeURIComponent(id)}${suffix}`;
}

export const api = {
  auth: {
    me: async () => request<User>("/api/v1/auth/me"),
    login: async (email: string, password: string) =>
      request<User>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    register: async (payload: {
      name: string;
      email: string;
      password: string;
      role: string;
      phone?: string;
    }) =>
      request<User>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    logout: async () =>
      request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),
    telegram: async (initData: string) =>
      request<User>("/api/v1/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ init_data: initData }),
      }),
  },
  shipments: {
    list: async (query = "") =>
      request<Shipment[]>(`/api/v1/shipments${query ? `?${query}` : ""}`),
    get: async (id: string) => request<Shipment>(resource("/api/v1/shipments", id)),
    create: async (payload: {
      from: string;
      to: string;
      date: string;
      cargo: string;
      weight: string;
      vehicle: string;
      price: string;
    }) =>
      request<Shipment>("/api/v1/shipments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    status: async (id: string, status: string) =>
      request<Shipment>(resource("/api/v1/shipments", id, "/status"), {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    events: async (id: string) => {
      const result = await request<WireShipmentEvent[]>(
        resource("/api/v1/shipments", id, "/events"),
      );
      return mapResult(result, (items) => items.map(mapShipmentEvent));
    },
  },
  offers: {
    list: async (shipmentId: string) => {
      const result = await request<WireOffer[]>(
        resource("/api/v1/shipments", shipmentId, "/offers"),
      );
      return mapResult(result, (items) => items.map(mapOffer));
    },
    create: async (
      shipmentId: string,
      payload: { price: string; eta: string; vehicle: string },
    ) => {
      const result = await request<WireOffer>(
        resource("/api/v1/shipments", shipmentId, "/offers"),
        { method: "POST", body: JSON.stringify(payload) },
      );
      return mapResult(result, mapOffer);
    },
    accept: async (id: string) => {
      const result = await request<WireOffer>(resource("/api/v1/offers", id, "/accept"), {
        method: "POST",
      });
      return mapResult(result, mapOffer);
    },
  },
  fleet: {
    list: async () => {
      const result = await request<WireFleetVehicle[]>("/api/v1/fleet");
      return mapResult(result, (items) => items.map(mapFleetVehicle));
    },
    create: async (payload: {
      plate: string;
      model: string;
      body: string;
      capacity: string;
      volume: string;
    }) => {
      const result = await request<WireFleetVehicle>("/api/v1/fleet", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return mapResult(result, mapFleetVehicle);
    },
  },
  drivers: {
    assignments: async () => {
      const result = await request<WireDriverAssignment[]>("/api/v1/drivers/assignments");
      return mapResult(result, (items) => items.map(mapDriverAssignment));
    },
    assign: async (shipmentId: string, payload: { driverId: string; vehicleId?: string | null }) => {
      const result = await request<WireDriverAssignment>(
        resource("/api/v1/shipments", shipmentId, "/driver"),
        {
          method: "POST",
          body: JSON.stringify({
            driver_id: payload.driverId,
            vehicle_id: payload.vehicleId || null,
          }),
        },
      );
      return mapResult(result, mapDriverAssignment);
    },
  },
  notifications: {
    list: async () => request<NotificationItem[]>("/api/v1/notifications"),
    read: async (id: string) =>
      request<{ ok: boolean }>(resource("/api/v1/notifications", id, "/read"), {
        method: "POST",
      }),
    readAll: async () =>
      request<{ ok: boolean }>("/api/v1/notifications/read-all", { method: "POST" }),
  },
  health: async () => request<HealthStatus>("/api/v1/health"),
  about: async () =>
    request<{
      name: string;
      version: string;
      frontend_origin: string;
      realtime: string[];
      telegram: boolean;
    }>("/api/v1/about"),
};
