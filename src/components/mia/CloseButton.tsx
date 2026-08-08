"use client";

/**
 * Boton de cerrar consistente para hojas/paneles superpuestos - dos
 * variantes:
 * - "floating": flota sobre una foto/fondo variable (ej. DetailSheet sobre
 *   la miniatura del beneficio) - circulo blanco solido + sombra, para que
 *   nunca se pierda contra la imagen de fondo, sin taparla ni reemplazarla.
 * - "header": vive dentro de una barra de encabezado ya solida (ChatOverlay,
 *   ConnectionsSheet, ProfileSheet) - mismo trazo grueso, sin circulo
 *   propio, solo mas oscuro/grande que el "×" de texto plano de antes.
 */
export default function CloseButton({
  onClick,
  variant = "floating",
}: {
  onClick: () => void;
  variant?: "floating" | "header";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      className={
        variant === "floating"
          ? "flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-700 shadow-md ring-1 ring-black/5 transition active:scale-95"
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 active:scale-95"
      }
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
