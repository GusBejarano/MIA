"use client";

import BenefitThumbnail from "@/components/mia/BenefitThumbnail";

export type GridCard = {
  id: string;
  title: string;
  tag: string;
  thumbUrl: string | null;
  /** Solo en el tab "Conectados" - distingue visualmente lo que ya es tuyo. */
  connected?: boolean;
};

/**
 * Grid responsivo real (auto-fill/minmax) para los tabs del home nuevo
 * (dev 2.5) - mismo patron que src/app/admin/AdminBenefitGrid.tsx (crece
 * hacia abajo, 1/2/3/n columnas segun ancho disponible), no el boton "ver
 * como PC" del prototipo.
 */
export default function BenefitGrid({
  cards,
  onSelect,
  emptyMessage,
}: {
  cards: GridCard[];
  onSelect: (id: string, title: string) => void;
  emptyMessage: string;
}) {
  if (cards.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-zinc-400">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelect(card.id, card.title)}
          className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
        >
          <div className="relative h-28 w-full">
            <BenefitThumbnail imageUrl={card.thumbUrl} title={card.title} className="h-full w-full" />
            {card.connected && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-mia-violet shadow-sm">
                Conectado
              </span>
            )}
          </div>
          <div className="p-2">
            <span className="mb-0.5 inline-block rounded-full bg-[#F3E8FE] px-2 py-0.5 text-[10px] font-semibold text-mia-violet">
              {card.tag}
            </span>
            <p className="line-clamp-2 text-xs font-medium leading-tight text-mia-ink">
              {card.title}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
