"use client";

import { useEffect, useRef, useState } from "react";
import { getPosition, haversineKm } from "@/lib/mia/geolocationClient";
import { NEARBY_HABITUAL_GATE_MESSAGE, NEARBY_EMPTY_STATE_MESSAGE } from "@/lib/mia/copy";
import BenefitThumbnail from "@/components/mia/BenefitThumbnail";
import type { GridCard } from "@/components/mia-home/BenefitGrid";

type NearbyCard = GridCard & { lat: number; lng: number };
type LocationState = "before" | "denied" | "granted";

/**
 * Tab "Cerca de ti" (OnB-4.1) - sin API de mapas (decision de producto, ver
 * ajuste dev 2.5): lista ordenada por distancia con haversineKm, mismo
 * patron que ya usa DetailSheet.tsx para ordenar sedes. Gateado por
 * getUserMaturityLevel via /api/mia/onboarding/benefits - hoy siempre
 * "explorador", asi que siempre se ve esta version de lista.
 */
export default function NearbyList({
  userId,
  onSelectBenefit,
  categoryFilter,
  refreshKey,
}: {
  userId: string;
  onSelectBenefit: (id: string, title: string) => void;
  /** VALOR de categoria (no el label) elegido en la fila compartida de HomeTabs.tsx - null = todas. */
  categoryFilter?: string | null;
  /** Sube al conectar/desconectar un benefactor o agregar/quitar una ciudad (ver MiaHome.tsx) - si el permiso ya estaba concedido, vuelve a pedir los beneficios sin re-pedir el permiso. */
  refreshKey?: number;
}) {
  const [locState, setLocState] = useState<LocationState>("before");
  const [cards, setCards] = useState<(NearbyCard & { distanceKm: number })[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPosition = useRef<{ lat: number; lng: number } | null>(null);

  const visibleCards = categoryFilter
    ? (cards ?? []).filter((c) => c.categoryValues?.includes(categoryFilter))
    : (cards ?? []);

  async function fetchNearby(lat: number, lng: number) {
    const res = await fetch(`/api/mia/onboarding/benefits?userId=${userId}&tab=cerca`);
    if (!res.ok) throw new Error();
    const data: { cards: NearbyCard[] } = await res.json();
    const sorted = data.cards
      .map((c) => ({ ...c, distanceKm: haversineKm(lat, lng, c.lat, c.lng) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    setCards(sorted);
  }

  async function requestLocation() {
    setLoading(true);
    setError(null);
    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      lastPosition.current = { lat, lng };

      // Mejor esfuerzo, no bloqueante - mismo patron que el resto de la app.
      fetch("/api/mia/declare-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, lat, lng }),
      }).catch(() => {});

      await fetchNearby(lat, lng);
      setLocState("granted");
    } catch {
      setLocState("denied");
    } finally {
      setLoading(false);
    }
  }

  const isFirstRefresh = useRef(true);
  useEffect(() => {
    if (isFirstRefresh.current) {
      isFirstRefresh.current = false;
      return;
    }
    if (locState !== "granted" || !lastPosition.current) return;
    fetchNearby(lastPosition.current.lat, lastPosition.current.lng).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (locState !== "granted") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="max-w-xs text-sm text-zinc-500">
          {locState === "denied"
            ? "No pudimos acceder a tu ubicación"
            : "MIA necesita tu ubicación solo para mostrarte lo que tienes cerca"}
        </p>
        <button
          type="button"
          onClick={requestLocation}
          disabled={loading}
          className={
            locState === "denied"
              ? "rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-mia-ink disabled:opacity-50"
              : "rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          }
        >
          {loading ? "Buscando..." : locState === "denied" ? "Habilitar ubicación" : "Compartir mi ubicación"}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        {visibleCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectBenefit(card.id, card.title)}
            className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
          >
            <div className="relative h-28 w-full">
              <BenefitThumbnail imageUrl={card.thumbUrl} title={card.title} className="h-full w-full" />
            </div>
            <span className="mx-2 mt-1.5 inline-block w-fit rounded-full bg-[#F3E8FE] px-2 py-0.5 text-[10px] font-semibold text-mia-violet">
              {card.tag}
            </span>
            <p className="line-clamp-2 px-2 pt-0.5 text-xs font-medium leading-tight text-mia-ink">
              {card.title}
            </p>
            <p className="px-2 pb-2 text-[11px] font-semibold text-mia-violet">
              {card.distanceKm < 1
                ? `${Math.round(card.distanceKm * 1000)} m`
                : `${card.distanceKm.toFixed(1)} km`}
            </p>
          </button>
        ))}
      </div>

      {visibleCards.length === 0 && (
        <p className="px-1 py-4 text-center text-sm text-zinc-400">{NEARBY_EMPTY_STATE_MESSAGE}</p>
      )}

      <p className="mt-2 rounded-2xl bg-[#F3E8FE] px-4 py-3 text-center text-xs text-mia-violet">
        {NEARBY_HABITUAL_GATE_MESSAGE}
      </p>
    </div>
  );
}
