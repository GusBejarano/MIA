"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getPosition, isGeolocationGranted, reverseGeocodeCity } from "@/lib/mia/geolocationClient";
import { callMia, claimVisit, type ClientState } from "@/lib/mia/apiClient";
import ChatPanel from "@/components/mia/ChatPanel";
import type { UiMessage, NavLink } from "@/lib/mia/uiMessages";

type Phase = "phone-gate" | "chatting";

type Bootstrap = {
  state: ClientState;
  reply: string;
  ui: UiMessage[];
  navLinks?: NavLink[];
};

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

// Metadatos de build inyectados en next.config.ts (ver NEXT_PUBLIC_* ahi) -
// version manual de package.json + hash corto del commit + prefijo de
// entorno ("dev-" fuera de la rama main en Netlify, vacio en produccion).
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_HASH = process.env.NEXT_PUBLIC_BUILD_HASH ?? "local";
const ENV_PREFIX = process.env.NEXT_PUBLIC_ENV_PREFIX ?? "dev-";
const VERSION_LABEL = `v${APP_VERSION} · ${ENV_PREFIX}${BUILD_HASH}`;

export default function MiaChat() {
  const [phase, setPhase] = useState<Phase>("phone-gate");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionCopied, setVersionCopied] = useState(false);

  // "Despierta" la funcion serverless (Netlify agrupa todas las rutas
  // dinamicas de Next.js en una sola funcion) apenas se carga la pantalla
  // de bienvenida - para cuando la persona termina de leer y escribir su
  // numero, el cold start (~7s medido en produccion tras ~5min sin
  // trafico) ya se resolvio en segundo plano. Pega a /api/health (nunca
  // /api/mia directo: esa ruta crea/actualiza un usuario real en Supabase
  // por cada llamada). Mejor que un ping programado cada N minutos las 24h
  // - solo gasta algo cuando hay una visita real.
  useEffect(() => {
    fetch("/api/health").catch(() => {
      // Silencioso a proposito - es solo un intento de precalentar la
      // funcion, si falla el flujo normal (con su propio manejo de
      // errores) sigue funcionando igual, solo mas lento.
    });
  }, []);

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
          payload.lat = pos.coords.latitude;
          payload.lng = pos.coords.longitude;
          if (detectedCity) payload.detectedCity = detectedCity;
        } catch (err) {
          console.error("Redeteccion silenciosa de ubicacion fallo:", err);
        }
      }

      const { reply, ui, navLinks, state } = await callMia(payload);
      window.localStorage.setItem(REMEMBERED_PHONE_KEY, trimmed);
      if (state.profile?.locationPermissionGranted) rememberLocationGranted(trimmed);
      setPhone(trimmed);
      setBootstrap({ state, reply, ui, navLinks });
      setPhase("chatting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salio mal");
    } finally {
      setLoading(false);
    }
  }

  if (phase === "phone-gate" || !bootstrap) {
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

      <ChatPanel
        phone={phone}
        initialState={bootstrap.state}
        initialReply={{ reply: bootstrap.reply, ui: bootstrap.ui, navLinks: bootstrap.navLinks }}
      />
    </div>
  );
}
