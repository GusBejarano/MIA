"use client";

import { useEffect } from "react";
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
 */
export default function ChatOverlay({
  phone,
  bootstrap,
  isOpen,
  onOpenChange,
  autoOpenDetail,
  onAutoOpenDetailConsumed,
  onCardCarouselResult,
}: {
  phone: string;
  bootstrap: ChatBootstrap | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  autoOpenDetail?: { id: string; title: string } | null;
  onAutoOpenDetailConsumed?: () => void;
  onCardCarouselResult?: (carousel: CardCarouselMessage, queryLabel: string) => void;
}) {
  useEffect(() => {
    if (autoOpenDetail) onAutoOpenDetailConsumed?.();
    // Solo nos interesa disparar la limpieza una vez que ChatPanel ya tuvo
    // oportunidad de leer autoOpenDetail (se lo pasamos por props, el efecto
    // interno de ChatPanel corre con la misma actualizacion) - no repetir
    // la limpieza si autoOpenDetail cambia por otras razones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenDetail]);

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
                autoOpenDetail={autoOpenDetail ?? undefined}
                onCardCarouselResult={onCardCarouselResult}
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
