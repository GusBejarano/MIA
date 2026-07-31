"use client";

import { useEffect, useMemo, useState } from "react";
import type { DetailSheetMessage } from "@/lib/mia/uiMessages";
import RatingStars from "@/components/mia/RatingStars";
import BenefitThumbnail from "@/components/mia/BenefitThumbnail";
import InfoTooltip from "@/components/mia/InfoTooltip";
import { getPosition, haversineKm } from "@/lib/mia/geolocationClient";

// A partir de este numero de sedes, el boton dice "Disponible en +N puntos"
// en vez de "Ver sedes (N)" - valor inicial razonable, facil de ajustar,
// no es una constante magica intocable.
const MANY_SEDES_THRESHOLD = 10;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function DetailSheet({
  message,
  userId,
  onClose,
  onLocationGranted,
}: {
  message: DetailSheetMessage;
  userId?: string;
  onClose: () => void;
  /** Se llama la primera vez que el usuario autoriza ubicacion desde la seccion de sedes, para que quien renderiza el chat actualice su propio estado de sesion - si no, un beneficio distinto visto despues en la misma sesion seguiria pensando que no hay permiso (el permiso ya quedo guardado en la BD, pero el estado del cliente viaja de turno en turno tal cual se lo mandan). */
  onLocationGranted?: () => void;
}) {
  const [rating, setRating] = useState(message.rating);
  const [hasRelation, setHasRelation] = useState(message.relation.hasRelation);
  const [declaring, setDeclaring] = useState(false);

  // Sedes (Fase 3, v2.0) - ausente/0/1 sede no cambia nada de lo de abajo.
  const sedes = useMemo(() => message.sedes ?? [], [message.sedes]);
  const sedeCount = sedes.length;
  // Orden aleatorio (regla 6 del diseno) para cuando no hay ubicacion del
  // usuario - se calcula una sola vez por apertura de la ficha, no en cada
  // render.
  const shuffledSedes = useMemo(() => shuffle(sedes), [sedes]);

  const [locationGranted, setLocationGranted] = useState(message.locationPermissionGranted ?? false);
  const [showSedes, setShowSedes] = useState(false);
  const [showLocationAsk, setShowLocationAsk] = useState(false);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationBlocked, setLocationBlocked] = useState(false);

  // Si el usuario ya autorizo antes (sesion anterior, o un beneficio previo
  // en esta misma sesion), pide la posicion en silencio - sin mostrar el
  // aviso de Aceptar/No me interesa (regla 4 del diseno de sedes).
  useEffect(() => {
    if (!locationGranted || sedeCount < 2 || userPosition || locationBlocked) return;
    getPosition()
      .then((pos) => setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => setLocationBlocked(true)); // degrada con gracia (regla 7) - no reintenta solo
  }, [locationGranted, sedeCount, userPosition, locationBlocked]);

  async function handleAcceptLocation() {
    setShowLocationAsk(false);
    try {
      const pos = await getPosition();
      setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationGranted(true);
      onLocationGranted?.();
      if (userId) {
        fetch("/api/mia/declare-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch((err) => console.error("No se pudo guardar la ubicacion:", err));
      }
    } catch (err) {
      console.error("Geolocalizacion fallo o bloqueada:", err);
      setLocationBlocked(true);
    }
  }

  async function handleDeclareRelation() {
    if (!userId || declaring) return;
    setDeclaring(true);
    try {
      const res = await fetch("/api/mia/declare-relation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, programId: message.relation.programId }),
      });
      if (!res.ok) throw new Error("No se pudo declarar la relacion");
      setHasRelation(true);
    } catch (err) {
      console.error("No se pudo declarar la relacion:", err);
    } finally {
      setDeclaring(false);
    }
  }

  async function handleRate(next: number) {
    const previous = rating;
    setRating(next);
    if (!userId) return;
    try {
      const res = await fetch("/api/mia/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, benefitId: message.id, rating: next }),
      });
      if (!res.ok) throw new Error("No se pudo guardar la calificacion");
    } catch (err) {
      console.error("No se pudo guardar la calificacion:", err);
      setRating(previous);
    }
  }

  // "Como llegar" solo se mantiene como link plano (comportamiento identico
  // al actual) cuando hay 0 o 1 sede - con 2+ pasa a ser el boton de sedes
  // de abajo (regla 2 del diseno), nunca los dos a la vez.
  const links = [
    sedeCount <= 1 && message.links.go
      ? { href: message.links.go, label: "Cómo llegar", icon: "📍" }
      : null,
    message.links.web ? { href: message.links.web, label: "Sitio web", icon: "🌐" } : null,
    message.links.social ? { href: message.links.social, label: "Redes", icon: "📷" } : null,
  ].filter((l): l is { href: string; label: string; icon: string } => l !== null);

  const sedesButtonLabel =
    sedeCount >= MANY_SEDES_THRESHOLD
      ? `📍 Disponible en +${Math.floor(sedeCount / 10) * 10} puntos en tu ciudad`
      : sedeCount >= 2
        ? `📍 Ver sedes (${sedeCount})`
        : null;

  const sedesWithCoords = shuffledSedes.filter(
    (s): s is typeof s & { lat: number; lng: number } => s.lat != null && s.lng != null
  );
  const sedesWithoutCoords = shuffledSedes.filter((s) => s.lat == null || s.lng == null);
  const sortedSedesWithCoords = userPosition
    ? [...sedesWithCoords].sort(
        (a, b) =>
          haversineKm(userPosition.lat, userPosition.lng, a.lat, a.lng) -
          haversineKm(userPosition.lat, userPosition.lng, b.lat, b.lng)
      )
    : sedesWithCoords;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white sm:max-w-sm sm:rounded-3xl">
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-zinc-200 sm:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-sm text-zinc-500"
        >
          ✕
        </button>

        <div className="mx-4 mt-4">
          <BenefitThumbnail
            imageUrl={message.photoUrl}
            title={message.title}
            className="h-36 w-full rounded-2xl"
          />
        </div>

        <div className="px-5 pb-6 pt-4">
          <span className="mb-2 inline-block rounded-lg bg-mia-violet/10 px-2.5 py-1 text-xs font-extrabold text-mia-violet">
            {message.tag}
          </span>
          <RatingStars rating={rating} onRate={handleRate} />
          <h3 className="text-lg font-extrabold leading-snug text-mia-ink">
            {message.title}
          </h3>
          {message.description && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              {message.description}
            </p>
          )}

          {message.redemptionInstructions && (
            <div className="mt-2">
              <InfoTooltip
                term="¿Cómo disfrutar este privilegio?"
                definition={message.redemptionInstructions}
              />
            </div>
          )}

          {!hasRelation && (
            <button
              type="button"
              onClick={handleDeclareRelation}
              disabled={declaring}
              className="mt-3 w-full rounded-2xl border border-dashed border-mia-violet/40 bg-mia-violet/5 px-3 py-2.5 text-center text-xs font-bold text-mia-violet disabled:opacity-50"
            >
              {declaring
                ? "Guardando..."
                : `Toca si tienes una relación activa con ${message.relation.programName}`}
            </button>
          )}

          {message.details.map((d, i) => (
            <div
              key={i}
              className="flex gap-2 border-t border-zinc-100 py-2.5 text-[13px]"
            >
              <div className="w-24 shrink-0 font-semibold text-zinc-400">{d.label}</div>
              <div className="font-semibold text-mia-ink">{d.value}</div>
            </div>
          ))}

          {(sedesButtonLabel || links.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sedesButtonLabel && (
                <button
                  type="button"
                  onClick={() => setShowSedes((s) => !s)}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-2.5 text-center text-xs font-bold text-white"
                >
                  {sedesButtonLabel}
                </button>
              )}
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    i === 0 && !sedesButtonLabel
                      ? "flex-1 rounded-2xl bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-2.5 text-center text-xs font-bold text-white"
                      : "flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center text-xs font-bold text-mia-ink"
                  }
                >
                  {l.icon} {l.label}
                </a>
              ))}
            </div>
          )}

          {showSedes && sedeCount >= 2 && (
            <div className="mt-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
              {locationGranted ? (
                <div className="mb-2 text-xs font-bold text-mia-ink">Sedes cerca a ti</div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLocationAsk((s) => !s)}
                  className="mb-2 inline-flex items-center gap-1 border-b border-dotted border-mia-violet text-xs font-semibold text-mia-violet"
                >
                  ¿Quieres ver cuáles están cerca?
                  <span aria-hidden>ⓘ</span>
                </button>
              )}

              {showLocationAsk && !locationGranted && (
                <div className="mb-3 rounded-xl bg-zinc-900 p-3 text-xs text-white">
                  <p className="mb-2 leading-relaxed">
                    Tu ubicación no se comparte con nadie — solo se usa para calcular qué tan
                    cerca están las sedes de los descuentos que consultes.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAcceptLocation}
                      className="flex-1 rounded-lg bg-white px-2 py-1.5 font-bold text-mia-ink"
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLocationAsk(false)}
                      className="flex-1 rounded-lg border border-white/30 px-2 py-1.5 font-bold text-white"
                    >
                      No me interesa
                    </button>
                  </div>
                </div>
              )}

              {userPosition ? (
                <>
                  <ul className="flex flex-col gap-1.5">
                    {sortedSedesWithCoords.map((s, i) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-xs"
                      >
                        <span className="font-semibold text-mia-ink">
                          Sede {i + 1} ·{" "}
                          {haversineKm(userPosition.lat, userPosition.lng, s.lat, s.lng).toFixed(1)}{" "}
                          km
                        </span>
                        <a
                          href={s.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-mia-cyan"
                          aria-label="Abrir en Google Maps"
                        >
                          ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                  {sedesWithoutCoords.length > 0 && (
                    <>
                      <div className="mb-1 mt-3 text-[11px] font-bold uppercase text-zinc-400">
                        Otras sedes
                      </div>
                      <ul className="flex flex-col gap-1.5">
                        {sedesWithoutCoords.map((s, i) => (
                          <li
                            key={s.id}
                            className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-xs"
                          >
                            <span className="font-semibold text-mia-ink">Sede {i + 1}</span>
                            <a
                              href={s.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-mia-cyan"
                              aria-label="Abrir en Google Maps"
                            >
                              ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {shuffledSedes.map((s, i) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-xs"
                    >
                      <span className="font-semibold text-mia-ink">Sede {i + 1}</span>
                      <a
                        href={s.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-mia-cyan"
                        aria-label="Abrir en Google Maps"
                      >
                        ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
