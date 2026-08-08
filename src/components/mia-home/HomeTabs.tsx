"use client";

import { useEffect, useState } from "react";
import BenefitGrid, { type GridCard } from "@/components/mia-home/BenefitGrid";
import NearbyList from "@/components/mia-home/NearbyList";

type Tab = "conectados" | "cerca" | "explorar";
type CategoryOption = { value: string; label: string; count: number };
export type Filter = { kind: "preferidos" } | { kind: "category"; value: string; label: string };

const TABS: { key: Tab; label: string }[] = [
  { key: "conectados", label: "Mis Beneficios" },
  { key: "cerca", label: "Cerca de ti" },
  { key: "explorar", label: "Explorar" },
];

export type ChatFilter = { label: string; cards: GridCard[] };

// "Preferidos": mas estrellas primero, luego mas % de descuento primero
// (feedback explicito, sexta prueba en vivo) - mismo criterio que ya usa
// el servidor en getConnectedBenefits, aplicado aqui en el cliente porque
// Explorar reutiliza connectedCards tal cual sin volver a pedirlo.
function sortByOwnRating(cards: GridCard[]): GridCard[] {
  return [...cards].sort((a, b) => {
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return (b.discountPercent ?? -1) - (a.discountPercent ?? -1);
  });
}

/**
 * OnB-4 / home de retorno: tabs Conectados / Cerca de ti / Explorar + fila
 * de filtro compartida entre las 3 (debajo de los tabs). Ya no existe un
 * "Todas" que muestre el catalogo completo sin filtrar (demasiado volumen,
 * feedback explicito) - la primera opcion es "Preferidos" (solo beneficios
 * con al menos 1 estrella propia, ordenados de mas a menos estrellas, sin
 * importar categoria) y el resto son categorias reales; siempre hay que
 * elegir una de las dos.
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
  refreshKey,
}: {
  userId: string;
  chatFilter: ChatFilter | null;
  onClearChatFilter: () => void;
  onSelectBenefit: (id: string, title: string) => void;
  refreshKey: number;
}) {
  const [tab, setTab] = useState<Tab>("conectados");
  const [connectedCards, setConnectedCards] = useState<GridCard[] | null>(null);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: "preferidos" });
  const [explorarCards, setExplorarCards] = useState<GridCard[] | null>(null);

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

  useEffect(() => {
    if (tab !== "explorar" || chatFilter || filter.kind !== "category") {
      // Limpia resultados de una categoria anterior al salir de Explorar o
      // cambiar a "Preferidos" - si no, quedarian mostrandose (sin usarse)
      // la proxima vez que se elija una categoria, con el estado
      // "Cargando" salteado de menos.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExplorarCards(null);
      return;
    }
    let cancelled = false;
    setExplorarCards(null);
    const params = new URLSearchParams({
      userId,
      categoryValue: filter.value,
      categoryLabel: filter.label,
    });
    fetch(`/api/mia/onboarding/explore?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setExplorarCards(data.cards ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, chatFilter, filter, userId, refreshKey]);

  const visibleConnectedCards =
    filter.kind === "preferidos"
      ? sortByOwnRating((connectedCards ?? []).filter((c) => (c.rating ?? 0) >= 1))
      : (connectedCards ?? []).filter((c) => c.categoryValues?.includes(filter.value));

  const explorarPreferidos =
    filter.kind === "preferidos"
      ? sortByOwnRating((connectedCards ?? []).filter((c) => (c.rating ?? 0) >= 1))
      : null;

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
              onClick={() => setTab(t.key)}
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

        {tab === "cerca" && (
          <NearbyList
            userId={userId}
            onSelectBenefit={onSelectBenefit}
            filter={filter}
            refreshKey={refreshKey}
          />
        )}

        {tab === "explorar" && (
          <div className="flex flex-col gap-3">
            {chatFilter ? (
              <>
                <div className="flex w-fit items-center gap-2 rounded-full bg-[#F3E8FE] px-3 py-1.5 text-xs text-mia-violet">
                  <span>{chatFilter.label}</span>
                  <button type="button" onClick={onClearChatFilter} aria-label="Quitar filtro">
                    ×
                  </button>
                </div>
                <BenefitGrid cards={chatFilter.cards} onSelect={onSelectBenefit} emptyMessage="" />
              </>
            ) : filter.kind === "preferidos" ? (
              <BenefitGrid
                cards={explorarPreferidos ?? []}
                onSelect={onSelectBenefit}
                emptyMessage={
                  connectedCards === null
                    ? "Cargando..."
                    : "Aún no le has puesto estrellas a ningún beneficio. Califica uno desde su ficha para verlo aquí."
                }
              />
            ) : (
              <BenefitGrid
                cards={explorarCards ?? []}
                onSelect={onSelectBenefit}
                emptyMessage={explorarCards === null ? "Cargando..." : "Sin beneficios en esta categoría todavía"}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
