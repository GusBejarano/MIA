"use client";

import { useState } from "react";

/**
 * Envuelve un termino dentro de un mensaje con un indicador visual (subrayado
 * punteado + icono ⓘ) que abre un popup con su definicion, al tocar (mobile)
 * o pasar el cursor (desktop).
 */
export default function InfoTooltip({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        aria-label={`Qué significa "${term}"`}
        className="inline-flex items-center gap-0.5 border-b border-dotted border-mia-violet font-semibold text-mia-violet"
      >
        {term}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <line
            x1="12"
            y1="11"
            x2="12"
            y2="16.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="7.5" r="1.15" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg"
        >
          {definition}
        </span>
      )}
    </span>
  );
}
