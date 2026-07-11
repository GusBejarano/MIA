"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/mia/claudeClient";
import type { Profile, Stage } from "@/lib/mia/onboarding";

type ClientState = {
  history: ChatMessage[];
  stage: Stage;
  profile: Profile;
  userId?: string;
};

type Phase = "phone-gate" | "chatting";

async function callMia(payload: Record<string, unknown>) {
  const res = await fetch("/api/mia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Algo salio mal");
  return data as { reply: string; state: ClientState };
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocalizacion no soportada"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionState?.history.length, loading]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    try {
      const { state } = await callMia({ phone: trimmed });
      setPhone(trimmed);
      setSessionState(state);
      setPhase("chatting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salio mal");
    } finally {
      setLoading(false);
    }
  }

  async function sendTurn(
    message: string,
    extra: { locationPermissionGranted?: boolean; detectedCity?: string } = {}
  ) {
    if (!sessionState) return;
    setLoading(true);
    setError(null);
    try {
      const { state } = await callMia({
        phone,
        message,
        state: sessionState,
        ...extra,
      });
      setSessionState(state);
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
      } catch {
        granted = false;
      }
    }

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
    await sendTurn(text);
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
          <p className="text-2xl font-semibold leading-snug text-mia-ink">
            MIA encuentra, entre cientos de beneficios, los que sí son para
            ti.
          </p>
          <p className="max-w-md text-lg leading-8 text-zinc-600">
            Descuentos que de verdad te sirven, sin perder tiempo revisando
            cientos de promociones.
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
          {sessionState?.history
            .filter((m, i) => !(i === 0 && m.role === "user"))
            .map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-2xl rounded-br-sm bg-gradient-to-r from-mia-violet to-mia-cyan px-4 py-2.5 text-white"
                    : "max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2.5 text-mia-ink"
                }
              >
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {m.content}
                </p>
              </div>
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
                placeholder="Escribe tu mensaje..."
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
    </div>
  );
}
