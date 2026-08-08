"use client";

import BenefitThumbnail from "@/components/mia/BenefitThumbnail";
import { Star } from "@/components/mia/RatingStars";

export type GridCard = {
  id: string;
  title: string;
  tag: string;
  thumbUrl: string | null;
  /** Solo en el tab "Conectados" - distingue visualmente lo que ya es tuyo. */
  connected?: boolean;
  /** Valores normalizados de categoria (category_list) - para el filtro de la fila de categorias de HomeTabs.tsx, nunca para mostrar (eso es `tag`). */
  categoryValues?: string[];
  /** Calificacion propia (1-3) del usuario para este beneficio, 0 si nunca lo califico - para el filtro "Preferidos" y para mostrarla en la tarjeta. */
  rating?: number;
  /** Ciudad (de tus ciudades de interes) donde aplica este beneficio puntual - Conectados/Cerca de ti mezclan tarjetas de varias ciudades a la vez. */
  cityLabel?: string;
  /** "Desde X%" extraido de las condiciones en texto libre - null/undefined si no se detecto ningun porcentaje (no se inventa, simplemente no se muestra el badge). */
  discountPercent?: number | null;
};

function RatingRow({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <Star key={i} filled={rating >= i} size={11} />
      ))}
    </span>
  );
}

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
            {card.discountPercent != null && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">
                Desde {card.discountPercent}%
              </span>
            )}
            {card.connected && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-mia-violet shadow-sm">
                Conectado
              </span>
            )}
          </div>
          <div className="p-2">
            <div className="mb-0.5 flex items-center justify-between gap-1">
              <span className="inline-block truncate rounded-full bg-[#F3E8FE] px-2 py-0.5 text-[10px] font-semibold text-mia-violet">
                {card.tag}
              </span>
              {!!card.rating && <RatingRow rating={card.rating} />}
            </div>
            <p className="line-clamp-2 text-xs font-medium leading-tight text-mia-ink">
              {card.title}
            </p>
            {card.cityLabel && (
              <p className="mt-0.5 truncate text-[10px] text-zinc-400">📍 {card.cityLabel}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
