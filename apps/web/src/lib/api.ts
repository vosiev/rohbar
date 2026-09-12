import type {
  ApiResult,
  AvailableVehicle,
  DriverAssignment,
  FleetVehicle,
  HealthStatus,
  NotificationItem,
  OfferStatus,
  Shipment,
  ShipmentEvent,
  ShipmentOffer,
  TeamDriver,
  User,
  VehicleBodyCode,
  VehicleStatus,
} from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") || "";

type WireShipment = {
  id: string;
  from: string;
  to: string;
  date: string;
  cargo: string;
  weight: string;
  weight_kg?: number | null;
  volume_liters?: number | null;
  volume_estimated: boolean;
  requested_body_code?: VehicleBodyCode | null;
  vehicle: string;
  selected_vehicle_id?: string | null;
  selected_carrier_id?: string | null;
  price: string;
  status: Shipment["status"];
  company: string;
};

type WireOffer = {
  id: string;
  shipment_id: string;
  carrier_id: string;
  carrier_name: string;
  vehicle: string;
  vehicle_id?: string | null;
  price: string;
  eta: string;
  status: OfferStatus;
};

type WireFleetVehicle = {
  id: string;
  owner_id: string;
  owner_name: string;
  plate: string;
  model: string;
  body: string;
  body_code?: VehicleBodyCode | null;
  capacity: string;
  capacity_kg?: number | null;
  volume: string;
  volume_liters?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  year?: number | null;
  photo_url?: string | null;
  status: VehicleStatus;
  driver_name?: string | null;
};

type WireAvailableVehicle = {
  id: string;
  carrier_id: string;
  carrier_name: string;
  plate: string;
  model: string;
  body: string;
  body_code?: VehicleBodyCode | null;
  capacity_kg: number;
  volume_liters?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  year?: number | null;
  photo_url?: string | null;
  status: VehicleStatus;
  reserved_weight_kg: number;
  reserved_volume_liters: number;
  remaining_weight_kg: number;
  remaining_volume_liters?: number | null;
  pending_reservations: number;
};

type WireDriverAssignment = {
  shipment_id: string;
  driver_id: string;
  driver_name: string;
  phone?: string | null;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
};

type WireTeamDriver = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  busy: boolean;
  current_shipment_id?: string | null;
};

type WireShipmentEvent = {
  id: string;
  shipment_id: string;
  event: string;
  actor_id: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export type FleetVehicleInput = {
  ownerEmail?: string;
  plate: string;
  model: string;
  body: string;
  bodyCode: VehicleBodyCode;
  capacityKg: number;
  volumeLiters: number;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  year?: number | null;
  photoUrl?: string | null;
  status?: VehicleStatus;
};

export type CreateShipmentInput = {
  from: string;
  to: string;
  date: string;
  cargo: string;
  weightKg: number;
  volumeLiters?: number | null;
  volumeEstimated: boolean;
  bodyCode?: VehicleBodyCode | null;
  selectedVehicleId?: string | null;
  price: string;
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

function mapShipment(value: WireShipment): Shipment {
  return {
    id: value.id,
    from: value.from,
    to: value.to,
    date: value.date,
    cargo: value.cargo,
    weight: value.weight,
    weightKg: value.weight_kg,
    volumeLiters: value.volume_liters,
    volumeEstimated: value.volume_estimated,
    requestedBodyCode: value.requested_body_code,
    vehicle: value.vehicle,
    selectedVehicleId: value.selected_vehicle_id,
    selectedCarrierId: value.selected_carrier_id,
    price: value.price,
    status: value.status,
    company: value.company,
  };
}

function mapOffer(value: WireOffer): ShipmentOffer {
  return {
    id: value.id,
    shipmentId: value.shipment_id,
    carrierId: value.carrier_id,
    carrierName: value.carrier_name,
    vehicle: value.vehicle,
    vehicleId: value.vehicle_id,
    price: value.price,
    eta: value.eta,
    status: value.status,
  };
}

function mapFleetVehicle(value: WireFleetVehicle): FleetVehicle {
  return {
    id: value.id,
    ownerId: value.owner_id,
    ownerName: value.owner_name,
    plate: value.plate,
    model: value.model,
    body: value.body,
    bodyCode: value.body_code,
    capacity: value.capacity,
    capacityKg: value.capacity_kg,
    volume: value.volume,
    volumeLiters: value.volume_liters,
    lengthMm: value.length_mm,
    widthMm: value.width_mm,
    heightMm: value.height_mm,
    year: value.year,
    photoUrl: value.photo_url,
    status: value.status,
    driverName: value.driver_name,
  };
}

function mapAvailableVehicle(value: WireAvailableVehicle): AvailableVehicle {
  return {
    id: value.id,
    carrierId: value.carrier_id,
    carrierName: value.carrier_name,
    plate: value.plate,
    model: value.model,
    body: value.body,
    bodyCode: value.body_code,
    capacityKg: value.capacity_kg,
    volumeLiters: value.volume_liters,
    lengthMm: value.length_mm,
    widthMm: value.width_mm,
    heightMm: value.height_mm,
    year: value.year,
    photoUrl: value.photo_url,
    status: value.status,
    reservedWeightKg: value.reserved_weight_kg,
    reservedVolumeLiters: value.reserved_volume_liters,
    remainingWeightKg: value.remaining_weight_kg,
    remainingVolumeLiters: value.remaining_volume_liters,
    pendingReservations: value.pending_reservations,
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

function mapTeamDriver(value: WireTeamDriver): TeamDriver {
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    phone: value.phone,
    busy: value.busy,
    currentShipmentId: value.current_shipment_id,
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

function fleetPayload(payload: FleetVehicleInput) {
  return {
    owner_email: payload.ownerEmail || null,
    plate: payload.plate,
    model: payload.model,
    body: payload.body,
    body_code: payload.bodyCode,
    capacity_kg: payload.capacityKg,
    volume_liters: payload.volumeLiters,
    length_mm: payload.lengthMm ?? null,
    width_mm: payload.widthMm ?? null,
    height_mm: payload.heightMm ?? null,
    year: payload.year ?? null,
    photo_url: payload.photoUrl || null,
    status: payload.status || "available",
  };
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
    updateProfile: async (payload: {
      name: string;
      email: string;
      phone?: string;
      currentPassword?: string;
    }) =>
      request<User>("/api/v1/profile", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          phone: payload.phone || null,
          current_password: payload.currentPassword || null,
        }),
      }),
    updatePassword: async (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>("/api/v1/profile/password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }),
    logout: async () => request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),
    telegram: async (initData: string) =>
      request<User>("/api/v1/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ init_data: initData }),
      }),
  },
  shipments: {
    list: async (query = "") => {
      const result = await request<WireShipment[]>(`/api/v1/shipments${query ? `?${query}` : ""}`);
      return mapResult(result, (items) => items.map(mapShipment));
    },
    get: async (id: string) => {
      const result = await request<WireShipment>(resource("/api/v1/shipments", id));
      return mapResult(result, mapShipment);
    },
    create: async (payload: CreateShipmentInput) => {
      const result = await request<WireShipment>("/api/v1/shipments", {
        method: "POST",
        body: JSON.stringify({
          from: payload.from,
          to: payload.to,
          date: payload.date,
          cargo: payload.cargo,
          weight_kg: payload.weightKg,
          volume_liters: payload.volumeLiters ?? null,
          volume_estimated: payload.volumeEstimated,
          body_code: payload.bodyCode || null,
          selected_vehicle_id: payload.selectedVehicleId || null,
          price: payload.price,
        }),
      });
      return mapResult(result, mapShipment);
    },
    status: async (id: string, status: string) => {
      const result = await request<WireShipment>(resource("/api/v1/shipments", id, "/status"), {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      return mapResult(result, mapShipment);
    },
    cancel: async (id: string) => {
      const result = await request<WireShipment>(resource("/api/v1/shipments", id, "/cancel"), {
        method: "POST",
      });
      return mapResult(result, mapShipment);
    },
    events: async (id: string) => {
      const result = await request<WireShipmentEvent[]>(resource("/api/v1/shipments", id, "/events"));
      return mapResult(result, (items) => items.map(mapShipmentEvent));
    },
  },
  offers: {
    list: async (shipmentId: string) => {
      const result = await request<WireOffer[]>(resource("/api/v1/shipments", shipmentId, "/offers"));
      return mapResult(result, (items) => items.map(mapOffer));
    },
    create: async (shipmentId: string, payload: { price: string; eta: string; vehicleId: string }) => {
      const result = await request<WireOffer>(resource("/api/v1/shipments", shipmentId, "/offers"), {
        method: "POST",
        body: JSON.stringify({ price: payload.price, eta: payload.eta, vehicle_id: payload.vehicleId }),
      });
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
    available: async (filters?: { weightKg?: number; volumeLiters?: number; bodyCode?: VehicleBodyCode }) => {
      const search = new URLSearchParams();
      if (filters?.weightKg) search.set("weight_kg", String(filters.weightKg));
      if (filters?.volumeLiters) search.set("volume_liters", String(filters.volumeLiters));
      if (filters?.bodyCode) search.set("body_code", filters.bodyCode);
      const result = await request<WireAvailableVehicle[]>(
        `/api/v1/fleet/available${search.size ? `?${search.toString()}` : ""}`,
      );
      return mapResult(result, (items) => items.map(mapAvailableVehicle));
    },
    create: async (payload: FleetVehicleInput) => {
      const result = await request<WireFleetVehicle>("/api/v1/fleet", {
        method: "POST",
        body: JSON.stringify(fleetPayload(payload)),
      });
      return mapResult(result, mapFleetVehicle);
    },
    update: async (id: string, payload: FleetVehicleInput) => {
      const result = await request<WireFleetVehicle>(resource("/api/v1/fleet", id, "/update"), {
        method: "POST",
        body: JSON.stringify(fleetPayload(payload)),
      });
      return mapResult(result, mapFleetVehicle);
    },
  },
  drivers: {
    team: async () => {
      const result = await request<WireTeamDriver[]>("/api/v1/drivers/team");
      return mapResult(result, (items) => items.map(mapTeamDriver));
    },
    addToTeam: async (email: string) => {
      const result = await request<WireTeamDriver>("/api/v1/drivers/team", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return mapResult(result, mapTeamDriver);
    },
    removeFromTeam: async (driverId: string) =>
      request<{ ok: boolean }>(resource("/api/v1/drivers/team", driverId, "/remove"), {
        method: "POST",
      }),
    assignments: async () => {
      const result = await request<WireDriverAssignment[]>("/api/v1/drivers/assignments");
      return mapResult(result, (items) => items.map(mapDriverAssignment));
    },
    assign: async (shipmentId: string, payload: { driverId: string; vehicleId?: string | null }) => {
      const result = await request<WireDriverAssignment>(resource("/api/v1/shipments", shipmentId, "/driver"), {
        method: "POST",
        body: JSON.stringify({ driver_id: payload.driverId, vehicle_id: payload.vehicleId || null }),
      });
      return mapResult(result, mapDriverAssignment);
    },
  },
  notifications: {
    list: async () => request<NotificationItem[]>("/api/v1/notifications"),
    read: async (id: string) =>
      request<{ ok: boolean }>(resource("/api/v1/notifications", id, "/read"), { method: "POST" }),
    readAll: async () => request<{ ok: boolean }>("/api/v1/notifications/read-all", { method: "POST" }),
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
