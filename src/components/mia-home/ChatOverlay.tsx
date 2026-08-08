"use client";

import ChatPanel from "@/components/mia/ChatPanel";
import CloseButton from "@/components/mia/CloseButton";
import type { ClientState } from "@/lib/mia/apiClient";
import type { UiMessage, NavLink, CardCarouselMessage } from "@/lib/mia/uiMessages";

export type ChatBootstrap = {
  state: ClientState;
  reply: string;
  ui: UiMessage[];
  navLinks?: NavLink[];
};

/**
 * Boton flotante "MIA" + panel de chat superpuesto (dev 2.5). No hace su
 * propio bootstrap de sesion: usa el que ya arranco MiaHome en segundo
 * plano al entrar a los tabs (mismo `session_started` de siempre, sin
 * retrasarlo hasta que la persona toque el boton - ver MiaHome.tsx).
 * Reutiliza ChatPanel.tsx tal cual, el mismo componente que renderiza el
 * chat de pantalla completa en produccion.
 *
 * Tocar una tarjeta en un grid (Conectados/Cerca de ti/Explorar) YA NO
 * abre este overlay - ver MiaHome.viewDetail(), que llama al mismo motor
 * de chat pero muestra el DetailSheet solo, sin la conversacion alrededor
 * (feedback explicito: el detalle debe verse directo). Este overlay queda
 * exclusivamente para el boton flotante.
 */
export default function ChatOverlay({
  phone,
  bootstrap,
  isOpen,
  onOpenChange,
  onCardCarouselResult,
  onRatingChanged,
}: {
  phone: string;
  bootstrap: ChatBootstrap | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCardCarouselResult?: (carousel: CardCarouselMessage, queryLabel: string) => void;
  /** Calificar un beneficio desde el detalle abierto DENTRO del chat tambien debe invalidar el cache de Conectados/Preferidos - ver DetailSheet.tsx. */
  onRatingChanged?: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        disabled={!bootstrap}
        aria-label="Abrir chat con MIA"
        className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan font-bold text-white shadow-lg transition disabled:opacity-50"
      >
        MIA
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/35">
          <div className="flex h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white">
            <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan text-xs font-bold text-white">
                M
              </span>
              <span className="mia-gradient-text flex-1 text-lg font-bold">mia</span>
              <CloseButton onClick={() => onOpenChange(false)} variant="header" />
            </div>

            {bootstrap ? (
              <ChatPanel
                phone={phone}
                initialState={bootstrap.state}
                initialReply={{ reply: bootstrap.reply, ui: bootstrap.ui, navLinks: bootstrap.navLinks }}
                onCardCarouselResult={onCardCarouselResult}
                onRatingChanged={onRatingChanged}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
                Conectando con MIA...
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
