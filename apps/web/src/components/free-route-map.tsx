/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMessages } from "@/lib/i18n-context";
import { routingMessages } from "@/lib/messages/routing";
import { buildRouteViewport, loadTilesConfig, yandexTileUrl, type TilesConfig } from "@/lib/maps/yandex-tiles";
import type { RoutePreview } from "@/lib/routing";

const LOGO_PATH = "/maps/yandex-logo.svg";

export function FreeRouteMap({ route }: { route: RoutePreview }) {
  const { m, locale } = useMessages(routingMessages);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 320 });
  const [tiles, setTiles] = useState<TilesConfig | null>(null);
  const [logoReady, setLogoReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      loadTilesConfig(controller.signal),
      fetch(LOGO_PATH, { method: "HEAD", cache: "no-store", signal: controller.signal })
        .then(response => response.ok)
        .catch(() => false),
    ]).then(([config, logo]) => {
      if (!controller.signal.aborted) {
        setTiles(config);
        setLogoReady(logo);
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: 320 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const viewport = useMemo(
    () => buildRouteViewport(route, size.width, size.height),
    [route, size.height, size.width],
  );
  const mapEnabled = Boolean(viewport && tiles?.enabled && tiles.apiKey && logoReady);
  const durationMinutes = Math.max(0, Math.round(route.duration_seconds / 60));
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const distance = route.distance_km.toLocaleString(locale === "tg" ? "tg-TJ" : "ru-RU", {
    maximumFractionDigits: 1,
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h3 className="font-black text-slate-900">{m("routePreview")}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {route.from.name} → {route.to.name}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-black text-teal-800">{m("routeDistance", { value: distance })}</p>
          <p className="mt-1 text-slate-500">{m("routeDuration", { hours, minutes })}</p>
        </div>
      </div>

      <div ref={host} className="relative h-80 overflow-hidden bg-slate-100">
        {mapEnabled && viewport && tiles ? (
          <>
            {viewport.tiles.map(tile => (
              <img
                key={tile.key}
                alt=""
                aria-hidden="true"
                draggable={false}
                src={yandexTileUrl(tiles.apiKey, tile)}
                className="pointer-events-none absolute h-64 w-64 select-none"
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <path d={viewport.path} fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <path d={viewport.path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-teal-700" />
              <circle cx={viewport.start[0]} cy={viewport.start[1]} r="7" fill="white" stroke="currentColor" strokeWidth="4" className="text-teal-700" />
              <circle cx={viewport.end[0]} cy={viewport.end[1]} r="7" fill="white" stroke="currentColor" strokeWidth="4" className="text-slate-900" />
            </svg>
            <a
              href="https://yandex.ru/maps/"
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-0 left-0 z-10"
              aria-label={m("yandexAttribution")}
            >
              <img src={LOGO_PATH} alt={m("yandexAttribution")} className="block" />
            </a>
          </>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-500">
            <p className="max-w-md">{m("mapUnavailable")}</p>
          </div>
        )}
      </div>

      <div className="space-y-1 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <p>{route.truck_profile_applied ? m("truckRestrictionsApplied") : m("truckRestrictionsUnknown")}</p>
        <p>{route.traffic.live ? m("liveTraffic") : m("baselineTraffic")}</p>
        <p>{m("geoAttribution")}</p>
      </div>
    </section>
  );
}
