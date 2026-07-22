"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/mia/claudeClient";
import type { Profile, Stage } from "@/lib/mia/onboarding";
import type { UiMessage, DetailSheetMessage, NavLink } from "@/lib/mia/uiMessages";
import { RELACION_ACTIVA_TERM, RELACION_ACTIVA_DEFINITION } from "@/lib/mia/copy";
import ChipSelect from "@/components/mia/ChipSelect";
import SummaryCards from "@/components/mia/SummaryCards";
import BenefitCarousel from "@/components/mia/BenefitCarousel";
import DetailSheet from "@/components/mia/DetailSheet";
import InfoTooltip from "@/components/mia/InfoTooltip";

type ClientState = {
  history: ChatMessage[];
  stage: Stage;
  profile: Profile;
  userId?: string;
};

type Phase = "phone-gate" | "chatting";

type RenderMessage = {
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

// Recuerda el ultimo telefono usado en ESTE dispositivo/navegador (nunca en
// el servidor) para no hacerlo re-digitar - sigue pudiendo escribir otro.
const REMEMBERED_PHONE_KEY = "mia_phone";

// Recuerda, por numero de telefono, si ESTE dispositivo ya vio a ese numero
// conceder el permiso de ubicacion - es solo la verificacion rapida local;
// Supabase (users.location_permission_granted) es la fuente de verdad que
// respalda esto si el usuario cambia de dispositivo (ver store.ts).
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

// "Una visita real = un evento session_started". A diferencia de
// REMEMBERED_PHONE_KEY/LOCATION_GRANTED_KEY (localStorage, sobreviven
// para siempre) esto usa sessionStorage a proposito: vive mientras la
// pestana/ventana siga abierta y sobrevive a un refresco de pagina (no
// duplica el evento), pero se vacia solo al cerrarla - la proxima vez
// que el usuario abra MIA (aunque sea el mismo telefono) va a ser una
// pestana nueva, con sessionStorage vacio, y por lo tanto una visita
// nueva de verdad.
const VISIT_LOGGED_KEY = "mia_visit_logged";

/** true la primera vez que se llama en esta pestana; false en refrescos posteriores dentro de la misma visita. */
function claimVisit(): boolean {
  try {
    if (window.sessionStorage.getItem(VISIT_LOGGED_KEY)) return false;
    window.sessionStorage.setItem(VISIT_LOGGED_KEY, "1");
    return true;
  } catch {
    // sessionStorage no disponible (ej. modo privado estricto) - mejor
    // registrar la visita de mas que perderla del todo.
    return true;
  }
}

/**
 * Confirma en el navegador (no en nuestro registro) si el permiso de
 * geolocalizacion sigue concedido antes de invocarla en silencio - evita
 * disparar el dialogo nativo del navegador sin contexto cuando el permiso
 * fue revocado fuera de la app o nunca existio en este dispositivo.
 */
async function isGeolocationGranted(): Promise<boolean> {
  if (!("permissions" in navigator)) return false;
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state === "granted";
  } catch {
    return false;
  }
}

// Metadatos de build inyectados en next.config.ts (ver NEXT_PUBLIC_* ahi) -
// version manual de package.json + hash corto del commit + prefijo de
// entorno ("dev-" fuera de la rama main en Netlify, vacio en produccion).
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_HASH = process.env.NEXT_PUBLIC_BUILD_HASH ?? "local";
const ENV_PREFIX = process.env.NEXT_PUBLIC_ENV_PREFIX ?? "dev-";
const VERSION_LABEL = `v${APP_VERSION} · ${ENV_PREFIX}${BUILD_HASH}`;

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

async function callMia(payload: Record<string, unknown>) {
  const res = await fetch("/api/mia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Algo salio mal");
  return data as {
    reply: string;
    ui: UiMessage[];
    navLinks?: NavLink[];
    state: ClientState;
  };
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocalizacion no soportada"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 60000,
    });
  });
}

async function reverseGeocodeCity(
  lat: number,
  lon: number
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.city || data.locality || undefined;
  } catch {
    return undefined;
  }
}

export default function MiaChat() {
  const [phase, setPhase] = useState<Phase>("phone-gate");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [sessionState, setSessionState] = useState<ClientState | null>(null);
  const [messages, setMessages] = useState<RenderMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailMessage, setDetailMessage] = useState<DetailSheetMessage | null>(null);
  const [versionCopied, setVersionCopied] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  useEffect(() => {
    // Leer localStorage en el initializer de useState causaria un mismatch
    // de hidratacion (la pagina es estatica: el HTML del servidor nunca
    // conoce el valor guardado en ESE navegador) - por eso se hace aqui,
    // despues del primer render.
    const remembered = window.localStorage.getItem(REMEMBERED_PHONE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remembered) setPhoneInput(remembered);
  }, []);

  async function handleCopyVersionInfo() {
    const info = [
      `MIA ${VERSION_LABEL}`,
      `Entorno: ${ENV_PREFIX ? "Desarrollo" : "Producción"}`,
      `Fecha: ${new Date().toISOString()}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(info);
      setVersionCopied(true);
      setTimeout(() => setVersionCopied(false), 1500);
    } catch {
      // Clipboard API puede fallar sin HTTPS/permisos - no rompe la UI, el
      // usuario simplemente no ve la confirmacion "Copiado".
    }
  }

  function pushMessage(msg: Omit<RenderMessage, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: nextMessageId++ }]);
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { phone: trimmed, logVisit: claimVisit() };

      // Si este dispositivo ya vio a este numero conceder el permiso antes,
      // intenta redetectar la ubicacion en segundo plano - sin mostrar el
      // mensaje ni los botones - siempre que el navegador confirme que el
      // permiso sigue concedido. Si algo falla, el backend simplemente cae
      // de vuelta a la ultima ciudad que ya tenia guardada en Supabase.
      if (getLocationGrantedMap()[trimmed] && (await isGeolocationGranted())) {
        try {
          const pos = await getPosition();
          const detectedCity = await reverseGeocodeCity(
            pos.coords.latitude,
            pos.coords.longitude
          );
          payload.locationPermissionGranted = true;
          if (detectedCity) payload.detectedCity = detectedCity;
        } catch (err) {
          console.error("Redeteccion silenciosa de ubicacion fallo:", err);
        }
      }

      const { reply, ui, navLinks, state } = await callMia(payload);
      window.localStorage.setItem(REMEMBERED_PHONE_KEY, trimmed);
      if (state.profile?.locationPermissionGranted) rememberLocationGranted(trimmed);
      setPhone(trimmed);
      setSessionState(state);
      pushMessage({ role: "assistant", text: reply, ui, navLinks });
      setPhase("chatting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salio mal");
    } finally {
      setLoading(false);
    }
  }

  async function sendTurn(message: string, extra: Record<string, unknown> = {}) {
    if (!sessionState) return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salio mal");
    } finally {
      setLoading(false);
    }
  }

  async function handleLocationChoice(wantsToShare: boolean) {
    let granted = wantsToShare;
    let detectedCity: string | undefined;

    if (wantsToShare) {
      try {
        const pos = await getPosition();
        detectedCity = await reverseGeocodeCity(
          pos.coords.latitude,
          pos.coords.longitude
        );
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
    if (!sessionState) return;
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

  if (phase === "phone-gate") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6">
        <main className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <Image
            src="/logo/mia-logo.png"
            alt="mia"
            width={480}
            height={188}
            priority
            className="h-auto w-72 sm:w-80"
          />
          <p className="-mt-4 text-sm text-zinc-400">
            by Descuentos Inteligentes
          </p>
          <p className="max-[380px]:text-xl text-2xl font-semibold leading-snug text-mia-ink">
            ¿Sabías que existen descuentos esperando por ti?
          </p>
          <p className="max-w-md text-lg leading-8 text-zinc-600">
            MIA te ayuda a encontrarlos y usarlos, donde y cuando los
            necesitas.
          </p>

          <form
            onSubmit={handleStart}
            className="mt-2 flex w-full max-w-sm flex-col gap-3"
          >
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Tu numero de WhatsApp"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full rounded-full border border-zinc-200 px-5 py-3 text-center text-base text-mia-ink outline-none focus:border-mia-violet"
            />
            <button
              type="submit"
              disabled={loading || !phoneInput.trim()}
              className="w-full rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-5 py-3 text-base font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {loading ? "Conectando..." : "Empezar a chatear"}
            </button>
          </form>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <p className="text-xs text-zinc-400">
            Tu numero solo se usa para reconocerte entre visitas - nunca se
            comparte.
          </p>

          <button
            type="button"
            onClick={handleCopyVersionInfo}
            aria-label="Copiar información de versión para soporte"
            className="text-[10px] text-zinc-400"
          >
            {versionCopied ? "Copiado" : VERSION_LABEL}
          </button>
        </main>
      </div>
    );
  }

  const showLocationButtons =
    sessionState?.stage === "location_permission" && !loading;

  return (
    <div className="flex h-dvh flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <Image
          src="/logo/mia-icon.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7"
        />
        <span className="mia-gradient-text text-lg font-bold">mia</span>
        <span className="text-xs text-zinc-400">by Descuentos Inteligentes</span>
      </header>

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
                placeholder="Escribe si algo no aparece..."
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
          userId={sessionState?.userId}
          onClose={() => setDetailMessage(null)}
        />
      )}
    </div>
  );
}
