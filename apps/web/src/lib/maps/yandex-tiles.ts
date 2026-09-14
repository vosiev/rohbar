import type { RoutePreview } from "@/lib/routing";

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 13;
const MAX_LATITUDE = 85.05112878;

export type TilesConfig = {
  enabled: boolean;
  apiKey: string;
  attribution: string;
};

export type MapTile = {
  key: string;
  x: number;
  y: number;
  z: number;
  left: number;
  top: number;
};

export type RouteViewport = {
  zoom: number;
  tiles: MapTile[];
  path: string;
  start: [number, number];
  end: [number, number];
};

export async function loadTilesConfig(signal?: AbortSignal): Promise<TilesConfig> {
  const response = await fetch("/api/maps/tiles-config", { cache: "no-store", signal });
  if (!response.ok) return { enabled: false, apiKey: "", attribution: "Yandex Maps" };
  const value = await response.json().catch(() => null);
  return {
    enabled: Boolean(value?.enabled && value?.apiKey),
    apiKey: typeof value?.apiKey === "string" ? value.apiKey : "",
    attribution: "Yandex Maps",
  };
}

export function yandexTileUrl(apiKey: string, tile: Pick<MapTile, "x" | "y" | "z">) {
  const query = new URLSearchParams({
    x: String(tile.x),
    y: String(tile.y),
    z: String(tile.z),
    lang: "ru_RU",
    l: "map",
    maptype: "driving",
    projection: "web_mercator",
    apikey: apiKey,
  });
  return `https://tiles.api-maps.yandex.ru/v1/tiles/?${query}`;
}

export function buildRouteViewport(
  route: RoutePreview,
  width: number,
  height: number,
  padding = 36,
): RouteViewport | null {
  if (route.geometry.length < 2 || width < 160 || height < 120) return null;
  const geometry = route.geometry.filter(validLngLat);
  if (geometry.length < 2) return null;

  let zoom = MIN_ZOOM;
  for (let candidate = MAX_ZOOM; candidate >= MIN_ZOOM; candidate -= 1) {
    const projected = geometry.map(([lon, lat]) => project(lon, lat, candidate));
    const bounds = pixelBounds(projected);
    if (bounds.width <= Math.max(1, width - 2 * padding)
      && bounds.height <= Math.max(1, height - 2 * padding)) {
      zoom = candidate;
      break;
    }
  }

  const projected = geometry.map(([lon, lat]) => project(lon, lat, zoom));
  const bounds = pixelBounds(projected);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const originX = centerX - width / 2;
  const originY = centerY - height / 2;
  const path = projected
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${(x - originX).toFixed(1)},${(y - originY).toFixed(1)}`)
    .join(" ");

  const tiles = visibleTiles(originX, originY, width, height, zoom);
  const first = projected[0];
  const last = projected[projected.length - 1];
  return {
    zoom,
    tiles,
    path,
    start: [first[0] - originX, first[1] - originY],
    end: [last[0] - originX, last[1] - originY],
  };
}

function visibleTiles(originX: number, originY: number, width: number, height: number, zoom: number) {
  const count = 2 ** zoom;
  const minX = Math.floor(originX / TILE_SIZE);
  const maxX = Math.floor((originX + width) / TILE_SIZE);
  const minY = Math.max(0, Math.floor(originY / TILE_SIZE));
  const maxY = Math.min(count - 1, Math.floor((originY + height) / TILE_SIZE));
  const tiles: MapTile[] = [];
  for (let rawX = minX; rawX <= maxX; rawX += 1) {
    const x = ((rawX % count) + count) % count;
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({
        key: `${zoom}:${rawX}:${y}`,
        x,
        y,
        z: zoom,
        left: rawX * TILE_SIZE - originX,
        top: y * TILE_SIZE - originY,
      });
    }
  }
  return tiles;
}

function project(longitude: number, latitude: number, zoom: number): [number, number] {
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const sin = Math.sin((lat * Math.PI) / 180);
  const world = TILE_SIZE * 2 ** zoom;
  const x = ((longitude + 180) / 360) * world;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  return [x, y];
}

function pixelBounds(points: [number, number][]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function validLngLat(point: [number, number]) {
  return Number.isFinite(point[0])
    && Number.isFinite(point[1])
    && Math.abs(point[0]) <= 180
    && Math.abs(point[1]) <= 90;
}
