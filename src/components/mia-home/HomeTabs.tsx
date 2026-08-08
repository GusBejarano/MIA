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
 * OnB-4 / home de retorno: tabs Conectados / Cerca de ti / Explorar. El
 * filtro que deja una conversacion con MIA (chip removible, ver
 * ChatOverlay.tsx -> MiaHome.tsx) vive en `chatFilter`, propiedad de
 * MiaHome - nunca se persiste, es de esta sesion unicamente.
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
  const [activeCategory, setActiveCategory] = useState<CategoryOption | null>(null);
  const [categoryCards, setCategoryCards] = useState<GridCard[] | null>(null);

  useEffect(() => {
    if (tab !== "conectados" || connectedCards !== null) return;
    fetch(`/api/mia/onboarding/benefits?userId=${userId}&tab=conectados`)
      .then((r) => r.json())
      .then((data) => setConnectedCards(data.cards ?? []))
      .catch(() => setConnectedCards([]));
  }, [tab, userId, connectedCards]);

  useEffect(() => {
    if (tab !== "explorar" || chatFilter || categories !== null) return;
    fetch(`/api/mia/onboarding/explore?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [tab, userId, chatFilter, categories]);

  async function selectCategory(cat: CategoryOption) {
    setActiveCategory(cat);
    setCategoryCards(null);
    const params = new URLSearchParams({
      userId,
      categoryValue: cat.value,
      categoryLabel: cat.label,
    });
    const res = await fetch(`/api/mia/onboarding/explore?${params.toString()}`);
    const data = await res.json();
    setCategoryCards(data.cards ?? []);
  }

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

      {tab === "conectados" && (
        <BenefitGrid
          cards={connectedCards ?? []}
          onSelect={onSelectBenefit}
          emptyMessage={
            connectedCards === null
              ? "Cargando..."
              : "Todavía no hay beneficios de tus benefactores conectados en tus ciudades. Conecta más benefactores o ciudades desde el ícono de ajustes."
          }
        />
      )}

      {tab === "cerca" && <NearbyList userId={userId} onSelectBenefit={onSelectBenefit} />}

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
          ) : activeCategory ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory(null);
                  setCategoryCards(null);
                }}
                className="w-fit text-xs font-semibold text-mia-violet"
              >
                ← Todas las categorías
              </button>
              <BenefitGrid
                cards={categoryCards ?? []}
                onSelect={onSelectBenefit}
                emptyMessage={categoryCards === null ? "Cargando..." : "Sin beneficios en esta categoría todavía"}
              />
            </>
          ) : (
            <>
              <p className="text-left text-sm text-zinc-500">
                Lo que hables con MIA aparece filtrado aquí
              </p>
              <div className="flex flex-wrap gap-2">
                {(categories ?? []).map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => selectCategory(c)}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
