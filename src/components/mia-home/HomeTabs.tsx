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
 * momento, no solo Explorar. El filtro que deja una conversacion con MIA
 * (chip removible, ver ChatOverlay.tsx -> MiaHome.tsx) vive en
 * `chatFilter`, propiedad de MiaHome - nunca se persiste, es de esta
 * sesion unicamente, y solo aplica al tab Explorar (es resultado de una
 * busqueda puntual, no una categoria).
 */
export default function HomeTabs({
  userId,
  chatFilter,
  onClearChatFilter,
  onSelectBenefit,
}: {
  userId: string;
  chatFilter: ChatFilter | null;
  onClearChatFilter: () => void;
  onSelectBenefit: (id: string, title: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("conectados");
  const [connectedCards, setConnectedCards] = useState<GridCard[] | null>(null);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
  const [explorarCards, setExplorarCards] = useState<GridCard[] | null>(null);

  useEffect(() => {
    if (connectedCards !== null) return;
    fetch(`/api/mia/onboarding/benefits?userId=${userId}&tab=conectados`)
      .then((r) => r.json())
      .then((data) => setConnectedCards(data.cards ?? []))
      .catch(() => setConnectedCards([]));
  }, [userId, connectedCards]);

  useEffect(() => {
    if (categories !== null) return;
    fetch(`/api/mia/onboarding/explore?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [userId, categories]);

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
  }, [tab, chatFilter, selectedCategory, userId]);

  const visibleConnectedCards = selectedCategory
    ? (connectedCards ?? []).filter((c) => c.tag === selectedCategory.label)
    : connectedCards;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
      <div className="mb-3 flex gap-1 rounded-xl bg-zinc-100 p-1">
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

      <div className="mb-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
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
          categoryFilter={selectedCategory?.label ?? null}
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
  );
}
