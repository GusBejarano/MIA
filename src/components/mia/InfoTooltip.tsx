"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Margen minimo respecto a los bordes del viewport - tanto para decidir si
// hay espacio como para el propio "maxWidth" del popup en pantallas angostas.
const VIEWPORT_MARGIN = 12;

type Coords = { top: number; left: number };

/**
 * Envuelve un termino dentro de un mensaje con un indicador visual (subrayado
 * punteado + icono ⓘ) que abre un popup con su definicion, al tocar (mobile)
 * o pasar el cursor (desktop). El popup se renderiza en un portal a
 * document.body, con posicion "fixed" calculada a partir del espacio real
 * disponible alrededor del trigger - nunca se sale del viewport, sin
 * importar donde este el trigger ni el tamano de pantalla.
 */
export default function InfoTooltip({
  term,
  definition,
}: {
  term: string;
  definition: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();

  // Mide el popup ya montado (oculto) y recien ahi decide arriba/abajo e
  // izquierda/derecha segun el espacio real - el mismo patron que usan las
  // librerias de popover (medir, despues posicionar), asi nunca se adivina
  // el tamano del contenido de antemano.
  useLayoutEffect(() => {
    if (!open) return;

    function reposition() {
      const trigger = triggerRef.current;
      const popup = popupRef.current;
      if (!trigger || !popup) return;

      const triggerRect = trigger.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const spaceAbove = triggerRect.top;
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const showBelow =
        spaceBelow >= popupRect.height + VIEWPORT_MARGIN || spaceBelow > spaceAbove;

      const top = showBelow
        ? Math.min(
            triggerRect.bottom + VIEWPORT_MARGIN,
            viewportHeight - popupRect.height - VIEWPORT_MARGIN
          )
        : Math.max(triggerRect.top - popupRect.height - VIEWPORT_MARGIN, VIEWPORT_MARGIN);

      const idealLeft = triggerRect.left + triggerRect.width / 2 - popupRect.width / 2;
      const left = Math.min(
        Math.max(idealLeft, VIEWPORT_MARGIN),
        viewportWidth - popupRect.width - VIEWPORT_MARGIN
      );

      setCoords({ top, left });
    }

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open]);

  // Cierra al hacer scroll (la posicion "fixed" quedaria desalineada del
  // trigger) o al tocar/clicar fuera del trigger y del popup.
  useEffect(() => {
    if (!open) return;

    function handleOutsideOrScroll(e: Event) {
      if (e.type === "scroll") {
        setOpen(false);
        return;
      }
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("scroll", handleOutsideOrScroll, true);
    document.addEventListener("mousedown", handleOutsideOrScroll);
    document.addEventListener("touchstart", handleOutsideOrScroll);
    return () => {
      document.removeEventListener("scroll", handleOutsideOrScroll, true);
      document.removeEventListener("mousedown", handleOutsideOrScroll);
      document.removeEventListener("touchstart", handleOutsideOrScroll);
    };
  }, [open]);

  return (
    <span className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`Qué significa "${term}"`}
        aria-describedby={open ? popupId : undefined}
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

      {open &&
        createPortal(
          <div
            ref={popupRef}
            id={popupId}
            role="tooltip"
            style={{
              position: "fixed",
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
              maxWidth: `min(288px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
            }}
            className="z-50 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg"
          >
            {definition}
          </div>,
          document.body
        )}
    </span>
  );
}
