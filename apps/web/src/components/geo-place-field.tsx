"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Field, inputClass } from "@/components/rohbar-ui";
import { useMessages } from "@/lib/i18n-context";
import { routingMessages } from "@/lib/messages/routing";
import { searchPlaces, type GeoPlace } from "@/lib/routing";

type SearchState = {
  query: string;
  results: GeoPlace[];
  status: "idle" | "loading" | "ready" | "empty" | "error";
  activeIndex: number;
};

const idleSearch = (query = ""): SearchState => ({ query, results: [], status: "idle", activeIndex: -1 });

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
  const [search, setSearch] = useState<SearchState>(() => idleSearch());
  const generation = useRef(0);
  const query = value.trim();
  const activeSearch = !selected && query.length >= 2 && search.query === query ? search : idleSearch(query);

  useEffect(() => {
    const currentQuery = value.trim();
    const version = ++generation.current;
    if (selected || currentQuery.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearch({ query: currentQuery, results: [], status: "loading", activeIndex: -1 });
      void searchPlaces(currentQuery, controller.signal).then(result => {
        if (generation.current !== version || controller.signal.aborted) return;
        if (result.error) {
          setSearch({ query: currentQuery, results: [], status: "error", activeIndex: -1 });
          return;
        }
        setSearch({
          query: currentQuery,
          results: result.data,
          status: result.data.length ? "ready" : "empty",
          activeIndex: result.data.length ? 0 : -1,
        });
      }).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (generation.current === version) {
          setSearch({ query: currentQuery, results: [], status: "error", activeIndex: -1 });
        }
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected, value]);

  function choose(place: GeoPlace) {
    generation.current += 1;
    setSearch(idleSearch());
    onSelect(place);
  }

  function moveActive(direction: 1 | -1) {
    setSearch(current => {
      if (current.query !== query || current.status !== "ready" || current.results.length === 0) return current;
      return {
        ...current,
        activeIndex: Math.max(0, Math.min(current.results.length - 1, current.activeIndex + direction)),
      };
    });
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
          aria-expanded={activeSearch.status === "ready"}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeSearch.activeIndex >= 0 ? `${listId}-${activeSearch.activeIndex}` : undefined}
          onKeyDown={event => {
            if (activeSearch.status !== "ready" || activeSearch.results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === "Enter" && activeSearch.activeIndex >= 0) {
              event.preventDefault();
              choose(activeSearch.results[activeSearch.activeIndex]);
            } else if (event.key === "Escape") {
              generation.current += 1;
              setSearch(idleSearch());
            }
          }}
        />
        {selected && (
          <p className="mt-1 text-xs font-semibold text-teal-700">
            {selected.admin1_name ? `${selected.name}, ${selected.admin1_name}` : selected.name}
          </p>
        )}
        {!selected && query.length < 2 && value.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">{m("searchHint")}</p>
        )}
        {activeSearch.status === "loading" && <p className="mt-1 text-xs text-slate-400">{m("searching")}</p>}
        {activeSearch.status === "empty" && <p className="mt-1 text-xs text-slate-400">{m("noPlaces")}</p>}
        {activeSearch.status === "error" && <p className="mt-1 text-xs text-amber-700">{m("routeUnavailable")}</p>}
        {activeSearch.status === "ready" && activeSearch.results.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl"
          >
            {activeSearch.results.map((place, index) => (
              <li
                id={`${listId}-${index}`}
                key={place.geoname_id}
                role="option"
                aria-selected={index === activeSearch.activeIndex}
              >
                <button
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => choose(place)}
                  className={`w-full rounded-xl px-3 py-2 text-left ${index === activeSearch.activeIndex ? "bg-teal-50" : "hover:bg-slate-50"}`}
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
