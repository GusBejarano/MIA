import type { CardCarouselMessage } from "@/lib/mia/uiMessages";
import { Star } from "@/components/mia/RatingStars";

export default function BenefitCarousel({
  message,
  onSelect,
}: {
  message: CardCarouselMessage;
  onSelect: (id: string, title: string) => void;
}) {
  return (
    <div className="mt-1 flex w-full gap-3 overflow-x-auto pb-1">
      {message.cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelect(card.id, card.title)}
          className="flex w-36 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white text-left shadow-sm active:scale-[0.97]"
        >
          <div
            className="relative flex h-20 w-full items-center justify-center text-white"
            style={{ background: card.color }}
          >
            {card.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.thumbUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-black opacity-80">
                {card.title.charAt(0)}
              </span>
            )}
            {card.rating > 0 && (
              <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1 py-0.5">
                {Array.from({ length: card.rating }).map((_, i) => (
                  <Star key={i} filled size={9} />
                ))}
              </div>
            )}
          </div>
          <div className="px-2.5 py-2">
            <span className="mb-1 inline-block rounded-md bg-mia-violet/10 px-1.5 py-0.5 text-[10px] font-extrabold text-mia-violet">
              {card.tag}
            </span>
            <div className="line-clamp-2 text-xs font-bold leading-tight text-mia-ink">
              {card.title}
            </div>
            {card.relationBadge && (
              <span
                className={
                  card.relationBadge === "activa"
                    ? "mt-1 inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600"
                    : "mt-1 inline-block rounded-md bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500"
                }
              >
                {card.relationBadge === "activa" ? "Relación activa" : "Sin relación aún"}
              </span>
            )}
            <div className="mt-1 text-[11px] font-bold text-mia-cyan">Ver más →</div>
          </div>
        </button>
      ))}
    </div>
  );
}
