"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Field, inputClass } from "@/components/rohbar-ui";
import { useMessages } from "@/lib/i18n-context";
import { routingMessages } from "@/lib/messages/routing";
import { searchPlaces, type GeoPlace } from "@/lib/routing";

export function GeoPlaceField({
  label,
  value,
  placeholder,
  selected,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  selected: GeoPlace | null;
  onChange: (value: string) => void;
  onSelect: (place: GeoPlace) => void;
}) {
  const { m } = useMessages(routingMessages);
  const listId = useId();
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const generation = useRef(0);

  useEffect(() => {
    if (selected || value.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      setActiveIndex(-1);
      return;
    }
    const version = ++generation.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      void searchPlaces(value.trim(), controller.signal).then(result => {
        if (generation.current !== version || controller.signal.aborted) return;
        if (result.error) {
          setResults([]);
          setStatus("error");
          return;
        }
        setResults(result.data);
        setStatus(result.data.length ? "ready" : "empty");
        setActiveIndex(result.data.length ? 0 : -1);
      }).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (generation.current === version) setStatus("error");
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected, value]);

  function choose(place: GeoPlace) {
    generation.current += 1;
    setResults([]);
    setStatus("idle");
    setActiveIndex(-1);
    onSelect(place);
  }

  return (
    <Field label={label} required>
      <div className="relative">
        <input
          className={inputClass}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={status === "ready"}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          onKeyDown={event => {
            if (status !== "ready" || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex(index => Math.min(results.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(index => Math.max(0, index - 1));
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              choose(results[activeIndex]);
            } else if (event.key === "Escape") {
              setResults([]);
              setStatus("idle");
              setActiveIndex(-1);
            }
          }}
        />
        {selected && (
          <p className="mt-1 text-xs font-semibold text-teal-700">
            {selected.admin1_name ? `${selected.name}, ${selected.admin1_name}` : selected.name}
          </p>
        )}
        {!selected && value.trim().length < 2 && value.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">{m("searchHint")}</p>
        )}
        {status === "loading" && <p className="mt-1 text-xs text-slate-400">{m("searching")}</p>}
        {status === "empty" && <p className="mt-1 text-xs text-slate-400">{m("noPlaces")}</p>}
        {status === "error" && <p className="mt-1 text-xs text-amber-700">{m("routeUnavailable")}</p>}
        {status === "ready" && results.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl"
          >
            {results.map((place, index) => (
              <li
                id={`${listId}-${index}`}
                key={place.geoname_id}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => choose(place)}
                  className={`w-full rounded-xl px-3 py-2 text-left ${index === activeIndex ? "bg-teal-50" : "hover:bg-slate-50"}`}
                >
                  <span className="block text-sm font-bold text-slate-800">{place.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {[place.admin1_name, place.population > 0 ? place.population.toLocaleString() : null].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
