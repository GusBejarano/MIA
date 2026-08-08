"use client";

import { useEffect, useRef, useState } from "react";
import type { UiMessage, DetailSheetMessage, CardCarouselMessage, NavLink } from "@/lib/mia/uiMessages";
import { RELACION_ACTIVA_TERM, RELACION_ACTIVA_DEFINITION } from "@/lib/mia/copy";
import { getPosition, reverseGeocodeCity } from "@/lib/mia/geolocationClient";
import { callMia, type ClientState } from "@/lib/mia/apiClient";
import ChipSelect from "@/components/mia/ChipSelect";
import SummaryCards from "@/components/mia/SummaryCards";
import BenefitCarousel from "@/components/mia/BenefitCarousel";
import DetailSheet from "@/components/mia/DetailSheet";
import InfoTooltip from "@/components/mia/InfoTooltip";
import Tip from "@/components/mia/Tip";

export type RenderMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  ui?: UiMessage[];
  /** Enlaces tocables dentro de `text` (ej. ciudad/benefactor/categoria en el carrusel). */
  navLinks?: NavLink[];
  /** Solo para mensajes assistant con un bloque chip_select ya resuelto. */
  resolvedSelection?: string[];
};

let nextMessageId = 0;

// Rota en el placeholder del input (nunca en el valor real) - puro
// frontend, sin relacion con los estados de ensenar/recordar del
// buscador de negocio (esos dependen de datos del backend, ver
// onboarding.ts). Al menos un ejemplo de busqueda de negocio, para dar
// una pista pasiva de la funcionalidad incluso a quien nunca ve el tip.
const INPUT_PLACEHOLDER_EXAMPLES = [
  "Escribe si algo no aparece...",
  "¿Tienes descuento en Crepes & Waffles?",
  "Ej: el gimnasio de la 5ta",
];
const PLACEHOLDER_ROTATION_MS = 4000;

// Recuerda, por numero de telefono, si ESTE dispositivo ya vio a ese numero
// conceder el permiso de ubicacion - ver MiaChat.tsx (misma clave, se sigue
// escribiendo desde ahi en el bootstrap; ChatPanel tambien la actualiza
// cuando el permiso se concede DENTRO de una conversacion ya iniciada).
const LOCATION_GRANTED_KEY = "mia_location_granted";

function getLocationGrantedMap(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(LOCATION_GRANTED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function rememberLocationGranted(phone: string) {
  const map = getLocationGrantedMap();
  map[phone] = true;
  window.localStorage.setItem(LOCATION_GRANTED_KEY, JSON.stringify(map));
}

type TextHighlight = { term: string; render: () => React.ReactNode };

/**
 * Reemplaza, dentro de un texto plano, cada subcadena que matchea con un
 * highlight por el nodo que ese highlight define (tooltip de "relación
 * activa", enlaces de navegacion del carrusel, etc.) - generico para poder
 * combinar varios en el mismo mensaje. Solo la primera ocurrencia de cada
 * termino cuenta (los mensajes son copy fijo, cada dato dinamico aparece
 * una sola vez por diseno); si dos highlights se solapan, gana el que
 * aparece mas a la izquierda.
 */
function renderRichText(text: string, highlights: TextHighlight[]): React.ReactNode {
  const matches = highlights
    .map((h) => ({ ...h, index: text.indexOf(h.term) }))
    .filter((h) => h.index !== -1)
    .sort((a, b) => a.index - b.index);

  if (matches.length === 0) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.index < cursor) continue;
    if (m.index > cursor) nodes.push(text.slice(cursor, m.index));
    nodes.push(<span key={nodes.length}>{m.render()}</span>);
    cursor = m.index + m.term.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <>{nodes}</>;
}

/** Enlace tocable dentro de una oracion - gradiente de marca + negrita, sin romper la lectura. */
function NavLinkButton({ term, onTap }: { term: string; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="bg-gradient-to-r from-[#7C5CFC] to-[#4C7DFB] bg-clip-text font-bold text-transparent"
    >
      {term}
    </button>
  );
}

function messageHighlights(
  text: string,
  navLinks: NavLink[] | undefined,
  onNavTap: (term: string, action: string) => void
): TextHighlight[] {
  const highlights: TextHighlight[] = [
    {
      term: RELACION_ACTIVA_TERM,
      render: () => (
        <InfoTooltip term={RELACION_ACTIVA_TERM} definition={RELACION_ACTIVA_DEFINITION} />
      ),
    },
  ];
  for (const link of navLinks ?? []) {
    highlights.push({
      term: link.term,
      render: () => (
        <NavLinkButton term={link.term} onTap={() => onNavTap(link.term, link.action)} />
      ),
    });
  }
  return highlights;
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Bloque de conversacion con MIA (mensajes, chips/carrusel/tip, input,
 * detalle de beneficio) - extraido de MiaChat.tsx (dev 2.5) para
 * reutilizarlo tal cual tanto en la pantalla de chat completa como en el
 * overlay flotante nuevo (ChatOverlay.tsx). Arranca ya con la primera
 * respuesta de MIA resuelta (`initialState`/`initialReply`) - quien monta
 * este componente es responsable de haber hecho esa primera llamada a
 * /api/mia (ver handleStart en MiaChat.tsx y el bootstrap en
 * ChatOverlay.tsx), asi el timing de "primer turno" no cambia para
 * MiaChat.tsx respecto de como funciona hoy en produccion.
 */
export default function ChatPanel({
  phone,
  initialState,
  initialReply,
  autoOpenDetail,
  onCardCarouselResult,
}: {
  phone: string;
  initialState: ClientState;
  initialReply: { reply: string; ui: UiMessage[]; navLinks?: NavLink[] };
  /** Home nuevo (dev 2.5): al tocar una tarjeta en un grid (fuera del chat), este overlay abre ya mostrando ese detalle - se dispara una sola vez al montar. */
  autoOpenDetail?: { id: string; title: string };
  /** Home nuevo (dev 2.5): cuando una respuesta de MIA trae un card_carousel, se refleja como filtro (removible, solo de esta sesion) en el tab Explorar - ver HomeTabs.tsx. */
  onCardCarouselResult?: (carousel: CardCarouselMessage, queryLabel: string) => void;
}) {
  const [sessionState, setSessionState] = useState<ClientState>(initialState);
  const [messages, setMessages] = useState<RenderMessage[]>(() => [
    {
      id: nextMessageId++,
      role: "assistant",
      text: initialReply.reply,
      ui: initialReply.ui,
      navLinks: initialReply.navLinks,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailMessage, setDetailMessage] = useState<DetailSheetMessage | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % INPUT_PLACEHOLDER_EXAMPLES.length);
    }, PLACEHOLDER_ROTATION_MS);
    return () => clearInterval(id);
  }, []);

  function pushMessage(msg: Omit<RenderMessage, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: nextMessageId++ }]);
  }

  async function sendTurn(message: string, extra: Record<string, unknown> = {}) {
    setLoading(true);
    setError(null);
    try {
      const { reply, ui, navLinks, state } = await callMia({
        phone,
        message,
        state: sessionState,
        ...extra,
      });
      setSessionState(state);
      pushMessage({ role: "assistant", text: reply, ui, navLinks });
      const carousel = ui.find((u): u is CardCarouselMessage => u.type === "card_carousel");
      if (carousel) onCardCarouselResult?.(carousel, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salio mal");
    } finally {
      setLoading(false);
    }
  }

  async function handleLocationChoice(wantsToShare: boolean) {
    let granted = wantsToShare;
    let detectedCity: string | undefined;
    let lat: number | undefined;
    let lng: number | undefined;

    if (wantsToShare) {
      try {
        const pos = await getPosition();
        detectedCity = await reverseGeocodeCity(pos.coords.latitude, pos.coords.longitude);
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (err) {
        // GeolocationPositionError: 1 = permiso denegado, 2 = posicion no
        // disponible, 3 = timeout. Tambien falla aqui (sin popup real) si
        // el origen no es seguro (HTTPS o localhost) - los navegadores
        // bloquean geolocalizacion en HTTP salvo en localhost.
        console.error("Geolocalizacion fallo:", err);
        granted = false;
      }
    }

    if (granted) rememberLocationGranted(phone);

    const text = granted ? "Sí, comparto mi ubicación" : "Prefiero no compartirla";
    pushMessage({ role: "user", text });
    await sendTurn(granted ? "Si, dale." : "Prefiero no compartirla.", {
      locationPermissionGranted: granted,
      detectedCity,
      lat,
      lng,
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    pushMessage({ role: "user", text });
    await sendTurn(text);
  }

  async function handleChipConfirm(messageId: number, values: string[], labels: string[]) {
    const text = labels.length > 0 ? joinNatural(labels) : "Listo";
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, resolvedSelection: values } : m))
    );
    pushMessage({ role: "user", text });
    await sendTurn(text, { chipSelection: values });
  }

  /** Enlace tocado dentro de un mensaje (ciudad/benefactor/categoria) - mismo mecanismo que un chip, sin chip visible. */
  async function handleNavLinkTap(term: string, action: string) {
    pushMessage({ role: "user", text: term });
    await sendTurn(term, { chipSelection: [action] });
  }

  async function handleCardSelect(id: string, title: string) {
    setLoading(true);
    setError(null);
    pushMessage({ role: "user", text: `Ver detalle: ${title}` });
    try {
      const { reply, ui, navLinks, state } = await callMia({
        phone,
        message: `Quiero ver el detalle de "${title}"`,
        state: sessionState,
        viewDetailId: id,
      });
      setSessionState(state);
      pushMessage({ role: "assistant", text: reply, ui, navLinks });
      const detail = ui.find((u): u is DetailSheetMessage => u.type === "detail_sheet");
      if (detail) setDetailMessage(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salio mal");
    } finally {
      setLoading(false);
    }
  }

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpenDetail || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    handleCardSelect(autoOpenDetail.id, autoOpenDetail.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenDetail]);

  const showLocationButtons = sessionState.stage === "location_permission" && !loading;

  return (
    <div className="flex h-full flex-1 flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl rounded-br-sm bg-gradient-to-r from-mia-violet to-mia-cyan px-4 py-2.5 text-white"
                      : "max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2.5 text-mia-ink"
                  }
                >
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                    {renderRichText(m.text, messageHighlights(m.text, m.navLinks, handleNavLinkTap))}
                  </p>
                </div>
              </div>

              {m.ui?.map((block, bi) => (
                <div key={bi} className="ml-1">
                  {block.type === "chip_select" && (
                    <ChipSelect
                      message={block}
                      locked={!!m.resolvedSelection}
                      resolvedSelection={m.resolvedSelection}
                      onConfirm={(values) => {
                        const labels = block.options
                          .filter((o) => values.includes(o.value))
                          .map((o) => o.label);
                        handleChipConfirm(m.id, values, labels);
                      }}
                    />
                  )}
                  {block.type === "summary_cards" && <SummaryCards message={block} />}
                  {block.type === "card_carousel" && (
                    <BenefitCarousel message={block} onSelect={handleCardSelect} />
                  )}
                  {block.type === "tip" && <Tip message={block} />}
                </div>
              ))}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
              </div>
            </div>
          )}

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-zinc-100 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
        <div className="mx-auto max-w-lg">
          {showLocationButtons ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleLocationChoice(true)}
                className="flex-1 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-4 py-3 text-sm font-semibold text-white"
              >
                Compartir ubicación
              </button>
              <button
                type="button"
                onClick={() => handleLocationChoice(false)}
                className="flex-1 rounded-full border border-zinc-200 px-4 py-3 text-sm font-semibold text-mia-ink"
              >
                Ahora no
              </button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                type="text"
                placeholder={INPUT_PLACEHOLDER_EXAMPLES[placeholderIndex]}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className="flex-1 rounded-full border border-zinc-200 px-4 py-3 text-[15px] text-mia-ink outline-none focus:border-mia-violet disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Enviar"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan text-white disabled:opacity-50"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          )}
        </div>
      </div>

      {detailMessage && (
        <DetailSheet
          message={detailMessage}
          userId={sessionState.userId}
          onClose={() => setDetailMessage(null)}
          onLocationGranted={() =>
            setSessionState((s) => ({ ...s, profile: { ...s.profile, locationPermissionGranted: true } }))
          }
        />
      )}
    </div>
  );
}
