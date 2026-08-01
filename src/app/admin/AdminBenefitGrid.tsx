"use client";

import BenefitThumbnail from "@/components/mia/BenefitThumbnail";

export type AdminGridCard = {
  id: string;
  title: string;
  tag: string;
  status: "pendiente_revision" | "activo" | "inactivo";
  thumbUrl: string | null;
  /** Admin v2.1 - ausente en pantallas que todavia no cargan este dato. */
  auditStatus?: "auditado" | "sin_auditar";
};

const STATUS_DOT: Record<AdminGridCard["status"], string> = {
  activo: "bg-emerald-500",
  pendiente_revision: "bg-amber-500",
  inactivo: "bg-zinc-300",
};

/**
 * Grid responsivo real (auto-fill/minmax) - a diferencia de BenefitCarousel
 * (fila unica, scroll horizontal, pensado para el carrusel del chat), esta
 * es una pantalla de exploracion de catalogo: se acomoda en 1/2/3/n
 * columnas segun el ancho disponible y crece hacia abajo, no a los lados.
 */
export default function AdminBenefitGrid({
  cards,
  onSelect,
}: {
  cards: AdminGridCard[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelect(card.id)}
          className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
        >
          {/* Alto fijo (no aspect-ratio) a proposito - mismo patron que
              BenefitCarousel.tsx (h-20): una foto muy vertical/horizontal no
              debe poder afectar el alto de la tarjeta ni de la fila del
              grid. object-contain dentro de BenefitThumbnail ya evita
              recortar/deformar la imagen misma. */}
          <div className="relative h-28 w-full">
            <BenefitThumbnail imageUrl={card.thumbUrl} title={card.title} className="h-full w-full" />
            <span
              className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${STATUS_DOT[card.status]}`}
              title={card.status}
            />
            {/* Esquina opuesta al dot de status (activo/pendiente/inactivo)
                para que no se pisen - indicador de auditoria (Admin v2.1). */}
            {card.auditStatus && (
              <span
                className={`absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                  card.auditStatus === "auditado" ? "bg-emerald-500" : "bg-zinc-300"
                }`}
                title={card.auditStatus === "auditado" ? "Auditado" : "Sin auditar"}
              />
            )}
          </div>
          <div className="px-2.5 py-2">
            <span className="mb-1 inline-block rounded-md bg-mia-violet/10 px-1.5 py-0.5 text-[10px] font-extrabold text-mia-violet">
              {card.tag}
            </span>
            <div className="line-clamp-2 text-xs font-bold leading-tight text-mia-ink">
              {card.title}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
