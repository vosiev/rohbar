import type { ApiError } from "@/types/api";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";

export type GeoPlace = {
  geoname_id: number;
  name: string;
  admin1_code: string | null;
  admin1_name: string | null;
  feature_code: string;
  population: number;
  latitude: number;
  longitude: number;
};

export type RoutePoint = {
  id: number;
  name: string;
  lat: number;
  lon: number;
};

export type RoutePreview = {
  from: RoutePoint;
  to: RoutePoint;
  distance_km: number;
  duration_seconds: number;
  geometry: [number, number][];
  routing_profile: "truck";
  truck_profile_applied: boolean;
  traffic: {
    mode: "baseline" | "historical" | "live";
    live: boolean;
  };
};

type Result<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

async function routingRequest<T>(path: string, init?: RequestInit): Promise<Result<T>> {
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
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network request failed",
      },
    };
  }
}

export function searchPlaces(query: string, signal?: AbortSignal) {
  return routingRequest<GeoPlace[]>(`/api/v1/geo/search?q=${encodeURIComponent(query)}`, { signal });
}

export function previewRoute(
  fromId: number,
  toId: number,
  vehicleId?: string | null,
  signal?: AbortSignal,
) {
  return routingRequest<RoutePreview>("/api/v1/routes/preview", {
    method: "POST",
    signal,
    body: JSON.stringify({
      from_id: fromId,
      to_id: toId,
      vehicle_id: vehicleId || null,
    }),
  });
}
