"use client";

const STAR_PATH =
  "M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17.6l-5.9 3.1 1.3-6.6-4.9-4.6 6.6-.7L12 2.5z";

/** Tambien se usa suelta (sin botones) para el badge de calificacion del carrusel. */
export function Star({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={STAR_PATH}
        fill={filled ? "#FACC15" : "none"}
        stroke={filled ? "#FACC15" : "#D4D4D8"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 3 estrellas tocables. Tocar una no calificada rellena hasta ahi; tocar
 * una ya amarilla la deja en blanco a ella y a las de su derecha - nunca
 * queda una blanca a la izquierda de una amarilla.
 */
export default function RatingStars({
  rating,
  onRate,
  size = 18,
}: {
  rating: number;
  onRate: (rating: number) => void;
  size?: number;
}) {
  return (
    <div className="mb-2 flex items-center gap-1">
      {[1, 2, 3].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onRate(rating >= i ? i - 1 : i)}
          aria-label={`Calificar con ${i} estrella${i > 1 ? "s" : ""}`}
          className="p-0.5"
        >
          <Star filled={rating >= i} size={size} />
        </button>
      ))}
    </div>
  );
}
