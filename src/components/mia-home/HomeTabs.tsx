"use client";

import { useEffect, useState } from "react";
import BenefitGrid, { type GridCard } from "@/components/mia-home/BenefitGrid";
import NearbyList from "@/components/mia-home/NearbyList";

type Tab = "conectados" | "cerca" | "explorar";
type CategoryOption = { value: string; label: string; count: number };

const TABS: { key: Tab; label: string }[] = [
  { key: "conectados", label: "Conectados" },
  { key: "cerca", label: "Cerca de ti" },
  { key: "explorar", label: "Explorar" },
];

export type ChatFilter = { label: string; cards: GridCard[] };

/**
 * OnB-4 / home de retorno: tabs Conectados / Cerca de ti / Explorar +
 * fila de categorias compartida entre las 3 (debajo de los tabs, igual que
 * el prototipo) - elegir una categoria filtra la que este activa en ese
 * momento, no solo Explorar.
 *
 * Tabs y categorias viven FUERA del contenedor que hace scroll (a
 * diferencia de la primera version): si estuvieran adentro, el alto
 * variable del grid de beneficios podia empujarlas fuera de vista o
 * comprimirlas via flex-shrink apenas cargaban las tarjetas - se vio en
 * pruebas reales. `shrink-0` en ambas filas + el area de contenido con su
 * propio `overflow-y-auto` les reserva un espacio fijo sin importar el
 * tamano de pantalla.
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
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
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
    if (tab !== "explorar" || chatFilter || !selectedCategory) {
      // Limpia resultados de una categoria anterior al salir de Explorar o
      // volver a "Todas" - si no, quedarian mostrandose (sin usarse) la
      // proxima vez que se elija una categoria, con el estado "Cargando"
      // salteado de menos.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExplorarCards(null);
      return;
    }
    let cancelled = false;
    setExplorarCards(null);
    const params = new URLSearchParams({
      userId,
      categoryValue: selectedCategory.value,
      categoryLabel: selectedCategory.label,
    });
    fetch(`/api/mia/onboarding/explore?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setExplorarCards(data.cards ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, chatFilter, selectedCategory, userId, refreshKey]);

  const visibleConnectedCards = selectedCategory
    ? (connectedCards ?? []).filter((c) => c.categoryValues?.includes(selectedCategory.value))
    : connectedCards;

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
            onClick={() => setSelectedCategory(null)}
            className={
              selectedCategory === null
                ? "shrink-0 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-1.5 text-xs font-semibold text-white"
                : "shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
            }
          >
            Todas
          </button>
          {(categories ?? []).map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setSelectedCategory(c)}
              className={
                selectedCategory?.value === c.value
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
            cards={visibleConnectedCards ?? []}
            onSelect={onSelectBenefit}
            emptyMessage={
              connectedCards === null
                ? "Cargando..."
                : selectedCategory
                  ? "Sin beneficios de tus benefactores en esta categoría todavía."
                  : "Todavía no hay beneficios de tus benefactores conectados en tus ciudades. Conecta más benefactores o ciudades desde el ícono de ajustes."
            }
          />
        )}

        {tab === "cerca" && (
          <NearbyList
            userId={userId}
            onSelectBenefit={onSelectBenefit}
            categoryFilter={selectedCategory?.value ?? null}
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
            ) : selectedCategory ? (
              <BenefitGrid
                cards={explorarCards ?? []}
                onSelect={onSelectBenefit}
                emptyMessage={explorarCards === null ? "Cargando..." : "Sin beneficios en esta categoría todavía"}
              />
            ) : (
              <p className="text-left text-sm text-zinc-500">
                Elige una categoría arriba, o cuéntale a MIA qué buscas y aparece filtrado aquí
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
