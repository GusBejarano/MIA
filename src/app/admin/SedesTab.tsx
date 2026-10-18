"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminBenefitFull, AdminCityOption, MerchantSearchResult, MerchantLocation } from "@/lib/admin/catalog";
import { extractLatLngFromMapsUrl } from "@/lib/admin/mapsUrl";
import { coverageFromCities, coverageSummaryText } from "@/lib/admin/coverage";
import {
  loadBenefitFullAction,
  searchMerchantsAction,
  createMerchantAndLinkAction,
  linkExistingMerchantAction,
  createSedeFromLegacyAction,
  listMerchantLocationsAction,
  listAllCitiesAction,
  toggleLocationLinkAction,
  upsertLocationAction,
  deleteLocationAction,
  resolveMapsUrlLatLngAction,
} from "./catalogActions";

const MAX_VISIBLE_PER_GROUP = 5;

type LocationFormState = {
  id?: string;
  name: string;
  address: string;
  city: string;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
};

function emptyLocationForm(defaultCity: string): LocationFormState {
  return { name: "", address: "", city: defaultCity, mapsUrl: "", lat: null, lng: null };
}

function locationToForm(l: MerchantLocation): LocationFormState {
  return {
    id: l.id,
    name: l.name ?? "",
    address: l.address,
    city: l.city ?? "",
    mapsUrl: l.mapsUrl,
    lat: l.lat,
    lng: l.lng,
  };
}

type CityGroup = { city: string | null; label: string; locations: MerchantLocation[] };

export default function SedesTab({
  benefit,
  city,
  onBenefitUpdated,
}: {
  benefit: AdminBenefitFull;
  city: string;
  onBenefitUpdated: (updated: AdminBenefitFull) => void;
}) {
  const [query, setQuery] = useState(benefit.title);
  const [results, setResults] = useState<MerchantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [locations, setLocations] = useState<MerchantLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [cities, setCities] = useState<AdminCityOption[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [coverageNotice, setCoverageNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<LocationFormState | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const hasLegacyData = Boolean(benefit.address && benefit.how_to_get_there);

  const citiesMap = useMemo(
    () => Object.fromEntries(cities.map((c) => [c.value, c.label])),
    [cities]
  );

  useEffect(() => {
    listAllCitiesAction()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  useEffect(() => {
    if (!benefit.merchant_id) return;
    let cancelled = false;
    const merchantId = benefit.merchant_id;

    async function run() {
      setLoadingLocations(true);
      setLocationsError(null);
      try {
        const rows = await listMerchantLocationsAction(merchantId, benefit.id);
        if (!cancelled) setLocations(rows);
      } catch (err) {
        if (!cancelled) {
          setLocationsError(err instanceof Error ? err.message : "No se pudieron cargar las sedes.");
        }
      } finally {
        if (!cancelled) setLoadingLocations(false);
      }
    }
    run();

    return () => {
      cancelled = true;
    };
  }, [benefit.merchant_id, benefit.id]);

  const cityGroups: CityGroup[] = useMemo(() => {
    const map = new Map<string, MerchantLocation[]>();
    for (const l of locations) {
      const key = l.city ?? "__sin_ciudad__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    const groups = [...map.entries()].map(([key, locs]) => ({
      city: key === "__sin_ciudad__" ? null : key,
      label: key === "__sin_ciudad__" ? "Sin ciudad" : citiesMap[key] ?? key,
      locations: [...locs].sort((a, b) => {
        if (a.linked !== b.linked) return a.linked ? -1 : 1;
        return (a.name || a.address).localeCompare(b.name || b.address);
      }),
    }));
    groups.sort((a, b) => {
      if (b.locations.length !== a.locations.length) return b.locations.length - a.locations.length;
      return a.label.localeCompare(b.label);
    });
    return groups;
  }, [locations, citiesMap]);

  const linkedCityCoverage = useMemo(
    () =>
      coverageFromCities(
        locations.filter((l) => l.linked && l.city).map((l) => l.city as string),
        citiesMap
      ),
    [locations, citiesMap]
  );

  async function refreshBenefit() {
    const updated = await loadBenefitFullAction(benefit.id);
    if (updated) onBenefitUpdated(updated);
  }

  async function refreshLocations(merchantId: string) {
    const rows = await listMerchantLocationsAction(merchantId, benefit.id);
    setLocations(rows);
  }

  async function handleSearch() {
    setSearching(true);
    setLinkError(null);
    try {
      const rows = await searchMerchantsAction(query);
      setResults(rows);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "No se pudo buscar comercios.");
    } finally {
      setSearching(false);
    }
  }

  async function handleCreateMerchant() {
    setLinkError(null);
    try {
      await createMerchantAndLinkAction(benefit.id, query.trim() || benefit.title);
      await refreshBenefit();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "No se pudo crear el comercio.");
    }
  }

  async function handleLinkMerchant(merchantId: string) {
    setLinkError(null);
    try {
      await linkExistingMerchantAction(benefit.id, merchantId);
      await refreshBenefit();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "No se pudo vincular el comercio.");
    }
  }

  async function handleUseLegacy() {
    setLinkError(null);
    try {
      await createSedeFromLegacyAction(benefit.id);
      await refreshBenefit();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "No se pudo migrar la sede legacy.");
    }
  }

  async function handleToggleLink(location: MerchantLocation, linked: boolean) {
    if (!benefit.merchant_id) return;
    setLocationsError(null);
    setCoverageNotice(null);
    const merchantId = benefit.merchant_id;

    const linkedBefore = locations.filter((l) => l.linked);
    const wasFirstEverLinked = linked && linkedBefore.length === 0;
    const cityLinkedCountBefore = location.city
      ? linkedBefore.filter((l) => l.city === location.city).length
      : 0;

    try {
      await toggleLocationLinkAction(benefit.id, location.id, linked);
      await refreshLocations(merchantId);

      if (location.city) {
        const cityLabel = citiesMap[location.city] ?? location.city;
        if (wasFirstEverLinked) {
          setCoverageNotice(
            `Al vincular la primera sede, la cobertura deja de ser manual y pasa a calcularse desde las sedes. Este convenio empezará a mostrarse en ${cityLabel}.`
          );
        } else if (linked && cityLinkedCountBefore === 0) {
          setCoverageNotice(`Este convenio empezará a mostrarse en ${cityLabel}.`);
        } else if (!linked && cityLinkedCountBefore === 1) {
          setCoverageNotice(`Este convenio dejará de mostrarse en ${cityLabel}.`);
        }
      }
    } catch (err) {
      setLocationsError(err instanceof Error ? err.message : "No se pudo actualizar el vínculo.");
    }
  }

  async function handleDeleteLocation(locationId: string) {
    if (!benefit.merchant_id) return;
    setLocationsError(null);
    try {
      await deleteLocationAction(locationId);
      await refreshLocations(benefit.merchant_id);
    } catch (err) {
      setLocationsError(err instanceof Error ? err.message : "No se pudo eliminar la sede.");
    }
  }

  async function handleSaveLocation() {
    if (!editing || !benefit.merchant_id || !editing.city) return;
    setSavingLocation(true);
    setLocationsError(null);
    try {
      const locationId = await upsertLocationAction({
        id: editing.id,
        merchantId: benefit.merchant_id,
        name: editing.name.trim() || null,
        address: editing.address.trim(),
        city: editing.city,
        mapsUrl: editing.mapsUrl.trim(),
        lat: editing.lat,
        lng: editing.lng,
      });
      if (!editing.id) {
        // Sede nueva: se vincula a este beneficio automaticamente (regla
        // D.12 dice que el llamador la marca vinculada tras crearla).
        await toggleLocationLinkAction(benefit.id, locationId, true);
      }
      await refreshLocations(benefit.merchant_id);
      setEditing(null);
    } catch (err) {
      setLocationsError(err instanceof Error ? err.message : "No se pudo guardar la sede.");
    } finally {
      setSavingLocation(false);
    }
  }

  async function handleExtractCoords() {
    if (!editing?.mapsUrl.trim()) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const { lat, lng } = await resolveMapsUrlLatLngAction(editing.mapsUrl.trim());
      if (lat === null || lng === null) {
        setExtractError("No se pudieron extraer coordenadas de este link - complétalas a mano.");
      } else {
        setEditing({ ...editing, lat, lng });
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "No se pudo resolver el link.");
    } finally {
      setExtracting(false);
    }
  }

  function toggleGroupExpanded(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!benefit.merchant_id) {
    return (
      <div className="flex flex-col gap-3 p-4 text-xs">
        <p className="text-zinc-500">
          Este beneficio todavía no está vinculado a un comercio físico. Busca si ya existe (puede
          venir de otro benefactor) o crea uno nuevo.
        </p>
        {linkError && <p className="rounded-lg bg-red-50 p-2 text-red-700">{linkError}</p>}

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Nombre del comercio..."
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 p-2"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{r.name}</p>
                  <p className="text-zinc-500">
                    {r.locationCount} {r.locationCount === 1 ? "sede" : "sedes"}
                    {r.benefactors.length > 0 && ` · ${r.benefactors.join(", ")}`}
                  </p>
                </div>
                <button
                  onClick={() => handleLinkMerchant(r.id)}
                  className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Vincular
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={handleCreateMerchant}
          className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-center font-semibold text-zinc-600 hover:bg-zinc-50"
        >
          + Crear comercio nuevo &quot;{query.trim() || benefit.title}&quot;
        </button>

        {hasLegacyData && (
          <button
            onClick={handleUseLegacy}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-center font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Usar dirección/link actuales como primera sede
          </button>
        )}
      </div>
    );
  }

  const editingOriginal = editing?.id ? locations.find((l) => l.id === editing.id) ?? null : null;
  const cityChangedOnLinkedSede = Boolean(
    editing?.id &&
      editingOriginal?.linked &&
      editing.city &&
      editing.city !== (editingOriginal.city ?? "")
  );
  const cityChangePreview = (() => {
    if (!cityChangedOnLinkedSede || !editing) return null;
    const simulatedCities = locations
      .filter((l) => l.linked)
      .map((l) => (l.id === editing.id ? editing.city : l.city))
      .filter((c): c is string => Boolean(c));
    const coverage = coverageFromCities(simulatedCities, citiesMap);
    const newCityLabel = citiesMap[editing.city] ?? editing.city;
    const oldCity = editingOriginal?.city ?? null;
    const oldCityLabel = oldCity ? citiesMap[oldCity] ?? oldCity : null;
    const oldCityHasOthers = oldCity
      ? locations.some((l) => l.linked && l.id !== editing.id && l.city === oldCity)
      : true;
    return {
      summary: coverageSummaryText(coverage),
      startsIn: newCityLabel,
      stopsIn: oldCityLabel && !oldCityHasOthers ? oldCityLabel : null,
    };
  })();

  return (
    <div className="flex flex-col gap-3 p-4 text-xs">
      {locationsError && <p className="rounded-lg bg-red-50 p-2 text-red-700">{locationsError}</p>}
      {coverageNotice && (
        <p className="rounded-lg bg-sky-50 p-2 text-sky-700">{coverageNotice}</p>
      )}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
        <p className="font-semibold text-zinc-500">Cobertura de este convenio · calculada desde las sedes</p>
        <p className="mt-1 text-zinc-700">
          {linkedCityCoverage.length > 0
            ? coverageSummaryText(linkedCityCoverage)
            : "Sin sedes vinculadas todavía."}
        </p>
      </div>

      {loadingLocations && <p className="text-zinc-400">Cargando sedes...</p>}

      {!loadingLocations && (
        <div className="flex flex-col gap-3">
          {cityGroups.map((group) => {
            const key = group.city ?? "__sin_ciudad__";
            const expanded = expandedGroups.has(key);
            const visible = expanded ? group.locations : group.locations.slice(0, MAX_VISIBLE_PER_GROUP);
            const linkedInGroup = group.locations.filter((l) => l.linked).length;
            return (
              <div key={key}>
                <p className="mb-1 font-semibold text-zinc-500">
                  {group.label} · {group.locations.length} {group.locations.length === 1 ? "sede" : "sedes"}
                  {" · "}
                  {linkedInGroup} en este convenio
                </p>
                <ul className="flex flex-col gap-2">
                  {visible.map((l) => (
                    <li key={l.id} className="rounded-lg border border-zinc-200 p-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={l.linked}
                          onChange={(e) => handleToggleLink(l, e.target.checked)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-semibold text-zinc-900">{l.name || l.address}</p>
                          {l.name && <p className="text-zinc-500">{l.address}</p>}
                          <div className="mt-1 flex gap-1">
                            <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                              {group.label}
                            </span>
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                l.lat !== null && l.lng !== null
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-zinc-100 text-zinc-500"
                              }`}
                            >
                              {l.lat !== null && l.lng !== null ? "Geolocalizada" : "Sin coordenadas"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setExtractError(null);
                            setEditing(locationToForm(l));
                          }}
                          className="shrink-0 text-zinc-400 hover:text-zinc-900"
                          title="Editar"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDeleteLocation(l.id)}
                          className="shrink-0 text-zinc-400 hover:text-red-600"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {group.locations.length > MAX_VISIBLE_PER_GROUP && (
                  <button
                    onClick={() => toggleGroupExpanded(key)}
                    className="mt-1 text-[11px] font-semibold text-mia-cyan hover:underline"
                  >
                    {expanded
                      ? "Ver menos"
                      : `Ver ${group.locations.length - MAX_VISIBLE_PER_GROUP} sedes más de ${group.label}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!editing && (
        <button
          onClick={() => {
            setExtractError(null);
            setEditing(emptyLocationForm(city));
          }}
          className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-center font-semibold text-zinc-600 hover:bg-zinc-50"
        >
          + Agregar sede nueva
        </button>
      )}

      {editing && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 bg-zinc-50 p-3">
          <label className="block">
            <span className="mb-1 block font-semibold text-zinc-500">Nombre (opcional)</span>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-zinc-500">Dirección</span>
            <input
              type="text"
              value={editing.address}
              onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-zinc-500">Ciudad</span>
            <select
              value={editing.city}
              onChange={(e) => setEditing({ ...editing, city: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">Elige una ciudad...</option>
              {cities.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-zinc-400">
              Lista de ciudades registradas. Si no aparece, debe agregarse en la base de datos.
            </span>
            {cityChangePreview && (
              <p className="mt-1 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700">
                Al guardar, la cobertura del convenio quedaría: {cityChangePreview.summary || "(sin sedes)"}.
                {cityChangePreview.stopsIn && ` Dejará de mostrarse en ${cityChangePreview.stopsIn}.`}
                {" "}Empezará a mostrarse en {cityChangePreview.startsIn}.
              </p>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-zinc-500">Link de Google Maps</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={editing.mapsUrl}
                onChange={(e) => {
                  const mapsUrl = e.target.value;
                  const { lat, lng } = extractLatLngFromMapsUrl(mapsUrl);
                  setEditing({
                    ...editing,
                    mapsUrl,
                    lat: lat ?? editing.lat,
                    lng: lng ?? editing.lng,
                  });
                }}
                placeholder="https://www.google.com/maps/place/..."
                className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={handleExtractCoords}
                disabled={extracting || !editing.mapsUrl.trim()}
                className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {extracting ? "Extrayendo..." : "Extraer"}
              </button>
            </div>
            <span className="mt-1 block text-[10px] text-zinc-400">
              Si el link es corto (maps.app.goo.gl) no trae coordenadas en el texto - el botón lo
              resuelve para sacarlas de ahí.
            </span>
          </label>
          {extractError && <p className="rounded-lg bg-amber-50 p-2 text-amber-700">{extractError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block font-semibold text-zinc-500">Lat (si no se extrajo)</span>
              <input
                type="text"
                value={editing.lat ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, lat: e.target.value ? parseFloat(e.target.value) : null })
                }
                className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold text-zinc-500">Lng (si no se extrajo)</span>
              <input
                type="text"
                value={editing.lng ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, lng: e.target.value ? parseFloat(e.target.value) : null })
                }
                className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveLocation}
              disabled={
                savingLocation || !editing.address.trim() || !editing.mapsUrl.trim() || !editing.city
              }
              className="flex-1 rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              {savingLocation ? "Guardando..." : "Guardar sede"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
