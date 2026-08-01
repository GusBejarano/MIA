"use client";

import { useEffect, useState } from "react";
import type { AdminBenefitFull, MerchantSearchResult, MerchantLocation } from "@/lib/admin/catalog";
import {
  loadBenefitFullAction,
  searchMerchantsAction,
  createMerchantAndLinkAction,
  linkExistingMerchantAction,
  createSedeFromLegacyAction,
  listMerchantLocationsAction,
  toggleLocationLinkAction,
  upsertLocationAction,
  deleteLocationAction,
  resolveMapsUrlLatLngAction,
} from "./catalogActions";

// Espejo minimo de extractLatLngFromMapsUrl (catalog.ts) - no se puede
// importar esa funcion aqui: catalog.ts es server-only (lanza si detecta
// `window`, ver supabaseClient.ts) y este componente corre en el navegador.
function extractLatLngFromMapsUrl(url: string): { lat: number | null; lng: number | null } {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return { lat: null, lng: null };
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

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

  const [editing, setEditing] = useState<LocationFormState | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const hasLegacyData = Boolean(benefit.address && benefit.how_to_get_there);

  useEffect(() => {
    if (!benefit.merchant_id) return;
    let cancelled = false;
    const merchantId = benefit.merchant_id;

    async function run() {
      setLoadingLocations(true);
      setLocationsError(null);
      try {
        const rows = await listMerchantLocationsAction(merchantId, city, benefit.id);
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
  }, [benefit.merchant_id, benefit.id, city]);

  async function refreshBenefit() {
    const updated = await loadBenefitFullAction(benefit.id);
    if (updated) onBenefitUpdated(updated);
  }

  async function refreshLocations(merchantId: string) {
    const rows = await listMerchantLocationsAction(merchantId, city, benefit.id);
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

  async function handleToggleLink(locationId: string, linked: boolean) {
    if (!benefit.merchant_id) return;
    setLocationsError(null);
    try {
      await toggleLocationLinkAction(benefit.id, locationId, linked);
      await refreshLocations(benefit.merchant_id);
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
    if (!editing || !benefit.merchant_id) return;
    setSavingLocation(true);
    setLocationsError(null);
    try {
      const locationId = await upsertLocationAction({
        id: editing.id,
        merchantId: benefit.merchant_id,
        name: editing.name.trim() || null,
        address: editing.address.trim(),
        city: editing.city.trim() || null,
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

  const linkedCount = locations.filter((l) => l.linked).length;

  return (
    <div className="flex flex-col gap-3 p-4 text-xs">
      {locationsError && <p className="rounded-lg bg-red-50 p-2 text-red-700">{locationsError}</p>}

      <p className="text-zinc-500">
        {linkedCount} de {locations.length} sedes de este comercio aplican a este beneficio en{" "}
        {city}.
      </p>

      {loadingLocations && <p className="text-zinc-400">Cargando sedes...</p>}

      {!loadingLocations && (
        <ul className="flex flex-col gap-2">
          {locations.map((l) => (
            <li key={l.id} className="rounded-lg border border-zinc-200 p-2">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={l.linked}
                  onChange={(e) => handleToggleLink(l.id, e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900">{l.name || l.address}</p>
                  {l.name && <p className="text-zinc-500">{l.address}</p>}
                  <span
                    className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      l.lat !== null && l.lng !== null
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {l.lat !== null && l.lng !== null ? "Geolocalizada" : "Sin coordenadas"}
                  </span>
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
            <input
              type="text"
              value={editing.city}
              onChange={(e) => setEditing({ ...editing, city: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
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
              disabled={savingLocation || !editing.address.trim() || !editing.mapsUrl.trim()}
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
