"use client";

import { useEffect, useState } from "react";
import BenefitGrid, { type GridCard } from "@/components/mia-home/BenefitGrid";
import NearbyList from "@/components/mia-home/NearbyList";
import { SUGGESTIONS_EMPTY_MESSAGE } from "@/lib/mia/copy";

type Tab = "conectados" | "cerca" | "sugerencias";
type CategoryOption = { value: string; label: string; count: number };
export type Filter = { kind: "preferidos" } | { kind: "category"; value: string; label: string };

const TABS: { key: Tab; label: string }[] = [
  { key: "conectados", label: "Mis Beneficios" },
  { key: "cerca", label: "Cerca de ti" },
  { key: "sugerencias", label: "Sugerencias" },
];

export type ChatFilter = { label: string; cards: GridCard[] };

// "Preferidos": mas estrellas primero, luego mas % de descuento primero
// (feedback explicito, sexta prueba en vivo) - mismo criterio que ya usa
// el servidor en getConnectedBenefits.
function sortByOwnRating(cards: GridCard[]): GridCard[] {
  return [...cards].sort((a, b) => {
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return (b.discountPercent ?? -1) - (a.discountPercent ?? -1);
  });
}

/**
 * OnB-4 / home de retorno: tabs Conectados / Cerca de ti / Sugerencias +
 * fila de filtro (Preferidos + categorias reales) exclusiva de Conectados
 * (ajuste dev 2.5: "Explorar" se elimino - navegar el catalogo completo
 * por categoria, sin limite a los benefactores conectados, ya no existe en
 * la app). "Sugerencias" es 100% dependiente de la conversacion con MIA:
 * sin fila de categorias, sin contenido por defecto - ver el bloque
 * `tab === "sugerencias"` mas abajo.
 *
 * Tabs y filtro viven FUERA del contenedor que hace scroll: si estuvieran
 * adentro, el alto variable del grid de beneficios podia empujarlos fuera
 * de vista o comprimirlos via flex-shrink apenas cargaban las tarjetas -
 * se vio en pruebas reales. `shrink-0` en ambas filas + el area de
 * contenido con su propio `overflow-y-auto` les reserva un espacio fijo
 * sin importar el tamano de pantalla.
 *
 * `refreshKey` sube cada vez que se cierra "Mis conexiones" (ver
 * MiaHome.tsx) - conectar/desconectar un benefactor o agregar/quitar una
 * ciudad debe reflejarse de una vez en los 3 tabs, no solo en el proximo
 * refresco de pagina.
 */
export default function HomeTabs({
  userId,
  chatFilter,
  onClearChatFilter,
  onSelectBenefit,
  onOpenSuggestionsChat,
  refreshKey,
}: {
  userId: string;
  chatFilter: ChatFilter | null;
  onClearChatFilter: () => void;
  onSelectBenefit: (id: string, title: string) => void;
  /** Tocar el tab "Sugerencias" mientras esta vacio (sin chatFilter) abre el chat con el saludo especial - ver MiaHome.tsx. */
  onOpenSuggestionsChat: () => void;
  refreshKey: number;
}) {
  const [tab, setTab] = useState<Tab>("conectados");
  const [connectedCards, setConnectedCards] = useState<GridCard[] | null>(null);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: "preferidos" });

  useEffect(() => {
    // Reset a "Cargando..." antes del fetch - refreshKey puede volver a
    // disparar este efecto con datos previos todavia en pantalla (conectar/
    // desconectar un benefactor), no queremos mostrar el grid viejo mientras
    // llega el nuevo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnectedCards(null);
    fetch(`/api/mia/onboarding/benefits?userId=${userId}&tab=conectados`)
      .then((r) => r.json())
      .then((data) => setConnectedCards(data.cards ?? []))
      .catch(() => setConnectedCards([]));
  }, [userId, refreshKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategories(null);
    fetch(`/api/mia/onboarding/explore?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [userId, refreshKey]);

  const visibleConnectedCards =
    filter.kind === "preferidos"
      ? sortByOwnRating((connectedCards ?? []).filter((c) => (c.rating ?? 0) >= 1))
      : (connectedCards ?? []).filter((c) => c.categoryValues?.includes(filter.value));

  // La fila de categorias solo debe mostrar categorias que de verdad
  // tienen al menos un beneficio en "Conectados" ahora mismo (ciudad(es) +
  // benefactor(es) actuales) - antes venia de una consulta aparte
  // (getAvailableCategories) que solo miraba la primera ciudad, podia
  // mostrar categorias sin ningun resultado real o faltar otras (bug
  // reportado: "el listado de categorias no es consecuente con los
  // beneficios desplegados"). Se deriva de los datos que ya se estan
  // mostrando, nunca puede desalinearse.
  const availableCategoryValues = new Set(
    (connectedCards ?? []).flatMap((c) => c.categoryValues ?? [])
  );
  const visibleCategories = (categories ?? []).filter((c) => availableCategoryValues.has(c.value));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-3">
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                // Tocar "Sugerencias" mientras esta vacio abre el chat con
                // el saludo especial (regla del ajuste) - una vez tiene
                // resultado (chatFilter), volver a tocar el tab solo
                // navega, no reabre el chat solo.
                if (t.key === "sugerencias" && !chatFilter) {
                  onOpenSuggestionsChat();
                }
              }}
              className={
                tab === t.key
                  ? "flex-1 rounded-lg bg-white py-1.5 text-xs font-semibold text-mia-ink"
                  : "flex-1 rounded-lg py-1.5 text-xs font-medium text-zinc-500"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Exclusiva de "Conectados". "Cerca de ti" tiene su propio toggle
          local Todos/Favoritos (ver NearbyList.tsx) - la distancia ya es su
          propio criterio de foco. "Sugerencias" no tiene ningun filtro
          propio - depende 100% de lo que responda MIA (regla del ajuste). */}
      {tab !== "cerca" && tab !== "sugerencias" && (
        <div className="shrink-0 overflow-x-auto px-4 pb-2 pt-2">
          <div className="flex w-max gap-2">
            <button
              type="button"
              onClick={() => setFilter({ kind: "preferidos" })}
              className={
                filter.kind === "preferidos"
                  ? "shrink-0 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-1.5 text-xs font-semibold text-white"
                  : "shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
              }
            >
              ★ Preferidos
            </button>
            {visibleCategories.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setFilter({ kind: "category", value: c.value, label: c.label })}
                className={
                  filter.kind === "category" && filter.value === c.value
                    ? "shrink-0 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-1.5 text-xs font-semibold text-white"
                    : "shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {tab === "conectados" && (
          <BenefitGrid
            cards={visibleConnectedCards}
            onSelect={onSelectBenefit}
            emptyMessage={
              connectedCards === null
                ? "Cargando..."
                : filter.kind === "preferidos"
                  ? "Aún no le has puesto estrellas a ningún beneficio. Califica uno desde su ficha para verlo aquí."
                  : "Sin beneficios de tus benefactores en esta categoría todavía."
            }
          />
        )}

        {/* A diferencia de Conectados (cuyos datos viven aqui arriba, en
            HomeTabs, y sobreviven un cambio de pestaña sin problema),
            NearbyList maneja su propio estado de geolocalizacion. Con
            renderizado condicional (`&&`) se desmontaba por completo al
            salir de la pestaña y volvia a montarse de cero al regresar,
            perdiendo el "ya concedido" y repitiendo todo el flujo de
            redeteccion (perfil -> getPosition -> beneficios) cada vez - si
            cualquier paso fallaba en silencio, el boton de "Compartir mi
            ubicacion" volvia a aparecer aunque el permiso siguiera bien en
            BD (bug reportado). Se mantiene siempre montado y solo se oculta
            con CSS - la redeteccion del PERMISO corre una sola vez por
            sesion, pero la POSICION si se vuelve a leer en cada entrada
            (ver prop `active` en NearbyList.tsx - la persona se mueve, la
            posicion del primer open ya no sirve para siempre). */}
        <div className={tab === "cerca" ? "" : "hidden"}>
          <NearbyList
            userId={userId}
            onSelectBenefit={onSelectBenefit}
            refreshKey={refreshKey}
            active={tab === "cerca"}
          />
        </div>

        {tab === "sugerencias" && (
          <div className="flex flex-col gap-3">
            {chatFilter ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-mia-violet">{chatFilter.label}</span>
                  <button
                    type="button"
                    onClick={onClearChatFilter}
                    className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-mia-ink"
                  >
                    Limpiar
                  </button>
                </div>
                <BenefitGrid cards={chatFilter.cards} onSelect={onSelectBenefit} emptyMessage="" />
              </>
            ) : (
              <p className="whitespace-pre-line px-1 py-16 text-center text-sm text-zinc-400">
                {SUGGESTIONS_EMPTY_MESSAGE}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
