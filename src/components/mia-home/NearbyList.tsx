"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getPosition, haversineKm } from "@/lib/mia/geolocationClient";
import { NEARBY_HABITUAL_GATE_MESSAGE, NEARBY_EMPTY_STATE_MESSAGE, NEARBY_RADIUS_EMPTY_MESSAGE } from "@/lib/mia/copy";
import BenefitThumbnail from "@/components/mia/BenefitThumbnail";
import { Star } from "@/components/mia/RatingStars";
import type { GridCard } from "@/components/mia-home/BenefitGrid";

// Todas las sedes con coordenadas de este beneficio (puede tener varias) -
// se calcula la distancia a cada una y se usa la mas cercana, ver
// fetchNearby. Antes solo llegaba una (arbitraria) y podia calcular la
// distancia contra una sede lejana (bug reportado: "estoy a 0.4km pero no
// aparece en la lista").
type NearbyCard = GridCard & { locations: { lat: number; lng: number }[] };
// "checking" = redeteccion silenciosa en curso (perfil -> getPosition ->
// beneficios, puede tardar varios segundos sin GPS en computador) - antes
// se mostraba el mismo botón "Compartir mi ubicación" que el estado "before"
// durante toda esa espera, lo cual confundia (parecia estar pidiendo el
// permiso otra vez cuando en realidad ya lo tenia y solo estaba calculando).
type LocationState = "checking" | "before" | "denied" | "granted";
type MaturityLevel = "explorador" | "habitual" | "frecuente";

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 1000;
const RADIUS_STEP_M = 100;
const DEFAULT_RADIUS_M = 500;

// Frases cortas que rotan mientras se calcula la posicion - una sola no
// alcanza para 10 segundos sin sentirse trabada (feedback explicito).
const CHECKING_MESSAGES = [
  "Buscando lo que tienes cerca...",
  "Calculando distancias...",
  "Ubicando tus beneficios...",
  "Ya casi...",
];
const CHECKING_MESSAGE_INTERVAL_MS = 1800;

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Tab "Cerca de ti" - dos escenarios segun nivel de madurez
 * (getUserMaturityLevel, unico punto de control - hoy siempre
 * "explorador", el escenario Habitual queda armado pero inalcanzable en
 * la practica):
 *
 * - Explorador (este archivo, escenario activo hoy): sin mapa, texto
 *   informativo + slider de radio (100-1000 m, pasos de 100) + lista
 *   ordenada por distancia. Toggle local "Preferidos"/"Todos" (mismo orden
 *   y estilo de pildora que el filtro de "Mis Beneficios" - preferido =
 *   al menos 1 estrella propia, misma calificacion de benefit_ratings que
 *   ya existe - NO hay filtro de categoria en este tab).
 * - Habitual: mapa real con pines - placeholder por ahora (decision
 *   explicita: se construye de verdad cuando el nivel Habitual sea
 *   alcanzable y se confirme la integracion con Google Maps).
 */
export default function NearbyList({
  userId,
  onSelectBenefit,
  refreshKey,
}: {
  userId: string;
  onSelectBenefit: (id: string, title: string) => void;
  /** Sube al conectar/desconectar un benefactor o agregar/quitar una ciudad (ver MiaHome.tsx) - si el permiso ya estaba concedido, vuelve a pedir los beneficios sin re-pedir el permiso. */
  refreshKey?: number;
}) {
  const [locState, setLocState] = useState<LocationState>("checking");
  const [checkingMessageIndex, setCheckingMessageIndex] = useState(0);
  const [cards, setCards] = useState<(NearbyCard & { distanceKm: number })[] | null>(null);
  const [maturityLevel, setMaturityLevel] = useState<MaturityLevel>("explorador");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_M);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const lastPosition = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (locState !== "checking") return;
    const id = setInterval(() => {
      setCheckingMessageIndex((i) => (i + 1) % CHECKING_MESSAGES.length);
    }, CHECKING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [locState]);

  async function fetchNearby(lat: number, lng: number) {
    const res = await fetch(`/api/mia/onboarding/benefits?userId=${userId}&tab=cerca`);
    if (!res.ok) throw new Error();
    const data: { cards: NearbyCard[]; maturityLevel?: MaturityLevel } = await res.json();
    setMaturityLevel(data.maturityLevel ?? "explorador");
    const sorted = data.cards
      .map((c) => ({
        ...c,
        distanceKm: Math.min(...c.locations.map((loc) => haversineKm(lat, lng, loc.lat, loc.lng))),
      }))
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

  // Si el usuario ya concedio el permiso antes (users.location_permission_granted
  // en Supabase, ver store.ts), redetecta en silencio al entrar a este tab -
  // sin mostrar el boton "Compartir mi ubicacion" de nuevo. Va directo a
  // getPosition() cuando la BD dice que ya esta concedido (mismo patron que
  // DetailSheet.tsx) - NO se pre-valida con la Permissions API
  // (isGeolocationGranted): en varios navegadores/dispositivos esa consulta
  // da falso negativo aunque el permiso siga activo (bug reportado: volvia a
  // pedir el permiso en cada entrada a la pestaña). getPosition() ya
  // degrada solo si el permiso de verdad fue revocado.
  useEffect(() => {
    fetch(`/api/mia/onboarding/profile?userId=${userId}`)
      .then((r) => r.json())
      .then(async (data: { profile?: { locationPermissionGranted?: boolean } }) => {
        if (!data.profile?.locationPermissionGranted) {
          setLocState("before");
          return;
        }
        const pos = await getPosition();
        lastPosition.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        await fetchNearby(pos.coords.latitude, pos.coords.longitude);
        setLocState("granted");
      })
      .catch(() => {
        // Fallo el chequeo silencioso (permiso revocado, la BD dijo que
        // no, o un error de red) - pasa a "before", el usuario ve el
        // boton normal en vez de quedar atascado en "checking".
        setLocState("before");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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

  if (locState === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Image
          src="/logo/mia-icon.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 animate-pulse"
        />
        <p className="text-sm text-zinc-500">{CHECKING_MESSAGES[checkingMessageIndex]}</p>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mia-violet [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mia-violet [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mia-violet" />
        </div>
      </div>
    );
  }

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

  if (maturityLevel !== "explorador") {
    // Escenario 2 (Habitual) - inalcanzable hoy (getUserMaturityLevel
    // siempre devuelve "explorador"), placeholder deliberado hasta que se
    // confirme la integracion real con Google Maps.
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="max-w-xs text-sm text-zinc-500">El mapa con tus descuentos cerca se está preparando.</p>
      </div>
    );
  }

  const withinRadius = (cards ?? []).filter((c) => c.distanceKm * 1000 <= radiusMeters);
  const visibleCards = favoritesOnly
    ? [...withinRadius]
        .filter((c) => (c.rating ?? 0) >= 1)
        .sort((a, b) => {
          const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
          if (ratingDiff !== 0) return ratingDiff;
          return (b.discountPercent ?? -1) - (a.discountPercent ?? -1);
        })
    : withinRadius;

  return (
    <div className="flex flex-col gap-3">
      {/* Mismo estilo de pildora (gradiente activo / borde inactivo) y mismo
          padding (pt-2 pb-2) que la fila de filtro compartida de "Mis
          Beneficios"/"Explorar" en HomeTabs.tsx - este tab no la reutiliza
          (no tiene filtro de categoria), pero debe verse igual. */}
      <div className="flex w-max gap-2 pt-2 pb-2">
        <button
          type="button"
          onClick={() => setFavoritesOnly(true)}
          className={
            favoritesOnly
              ? "shrink-0 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-1.5 text-xs font-semibold text-white"
              : "shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
          }
        >
          ★ Preferidos
        </button>
        <button
          type="button"
          onClick={() => setFavoritesOnly(false)}
          className={
            !favoritesOnly
              ? "shrink-0 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-1.5 text-xs font-semibold text-white"
              : "shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
          }
        >
          Todos
        </button>
      </div>

      <div>
        <p className="mb-1 text-xs text-zinc-500">{radiusMeters} m a la redonda</p>
        <input
          type="range"
          min={MIN_RADIUS_M}
          max={MAX_RADIUS_M}
          step={RADIUS_STEP_M}
          value={radiusMeters}
          onChange={(e) => setRadiusMeters(Number(e.target.value))}
          className="w-full accent-mia-violet"
        />
      </div>

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
              {card.discountPercent != null && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">
                  Hasta {card.discountPercent}%
                </span>
              )}
              <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold text-mia-ink shadow-sm">
                {formatDistance(card.distanceKm)}
              </span>
            </div>
            <div className="mx-2 mt-1.5 flex items-center justify-between gap-1">
              <span className="inline-block truncate rounded-full bg-[#F3E8FE] px-2 py-0.5 text-[10px] font-semibold text-mia-violet">
                {card.tag}
              </span>
              {!!card.rating && (
                <span className="flex items-center gap-0.5">
                  {[1, 2, 3].map((i) => (
                    <Star key={i} filled={card.rating! >= i} size={11} />
                  ))}
                </span>
              )}
            </div>
            <p className="line-clamp-2 px-2 pt-0.5 text-xs font-medium leading-tight text-mia-ink">
              {card.title}
            </p>
            {card.cityLabel && (
              <p className="px-2 pb-2 pt-0.5 text-[10px] text-zinc-400">📍 {card.cityLabel}</p>
            )}
          </button>
        ))}
      </div>

      {visibleCards.length === 0 && (
        <p className="px-1 py-4 text-center text-sm text-zinc-400">
          {(cards ?? []).length === 0
            ? NEARBY_EMPTY_STATE_MESSAGE
            : favoritesOnly
              ? "Aún no le has puesto estrellas a ningún beneficio cercano. Califica uno desde su ficha para verlo aquí."
              : NEARBY_RADIUS_EMPTY_MESSAGE}
        </p>
      )}

      <p className="mt-2 rounded-2xl bg-[#F3E8FE] px-4 py-3 text-center text-xs text-mia-violet">
        {NEARBY_HABITUAL_GATE_MESSAGE}
      </p>
    </div>
  );
}
