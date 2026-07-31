"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Chrome/Android disparan este evento cuando la pagina cumple los
// criterios de instalabilidad (manifest + iconos + HTTPS) - no esta en
// lib.dom.d.ts todavia, TypeScript no lo conoce por defecto.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "other";

// Permanente hasta que el usuario instale o cierre el banner - mismo
// patron simple que REMEMBERED_PHONE_KEY en MiaChat.tsx (localStorage,
// sobrevive para siempre, un solo dispositivo/navegador).
const DISMISSED_KEY = "mia_install_prompt_dismissed";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS Safari se reporta como "MacIntel" en navigator.platform desde
  // iPadOS 13 - navigator.maxTouchPoints > 1 lo distingue de un Mac real.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/** Ya esta instalada y corriendo como app (no en el navegador) - nunca ofrecer instalar de nuevo. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari/iOS no soporta display-mode: standalone en matchMedia en
    // versiones viejas - navigator.standalone es su propia bandera.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Ofrece instalar MIA en el celular apenas se abre la pagina (mismo patron
 * que www.cinecolombia.com) - Android/Chrome dispara un prompt nativo real
 * (`beforeinstallprompt`), iOS/Safari no tiene esa API en absoluto, asi que
 * ahi solo podemos mostrar instrucciones (compartir -> agregar a inicio).
 * En desktop, o si ya esta instalada, no se muestra nada.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISSED_KEY)) return;

    // La deteccion de plataforma depende del navegador (no disponible en
    // el server), no hay forma de conocerla antes del primer efecto.
    const detected = detectPlatform();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detected);
    // iOS no tiene evento que esperar - se ofrece de una vez. Android
    // espera a beforeinstallprompt (mas abajo) para saber si el navegador
    // realmente la considera instalable en este momento.
    if (detected === "ios") setVisible(true);
  }, []);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      if (window.localStorage.getItem(DISMISSED_KEY)) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    // No importa si acepta o no - Chrome no vuelve a disparar el evento
    // para esta instalacion hasta recargar, y no queremos volver a
    // interrumpir en esta visita de todos modos.
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  // El panel /admin es un producto aparte, sin nada de la UI publica de MIA.
  if (pathname?.startsWith("/admin")) return null;
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg">
        <Image
          src="/logo/mia-icon.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-xl"
        />

        {platform === "android" ? (
          <>
            <div className="flex-1 text-sm text-mia-ink">
              <p className="font-semibold">Instala MIA en tu celular</p>
              <p className="text-zinc-500">Acceso directo, sin ocupar espacio de mas.</p>
            </div>
            <button
              type="button"
              onClick={handleInstall}
              className="shrink-0 rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-4 py-2 text-sm font-semibold text-white"
            >
              Instalar
            </button>
          </>
        ) : (
          <div className="flex-1 text-sm text-mia-ink">
            <p className="font-semibold">Instala MIA en tu iPhone</p>
            <p className="text-zinc-500">
              Toca <ShareIcon /> y luego &quot;Agregar a inicio&quot;.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="shrink-0 self-start text-zinc-400"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Icono de "compartir" de iOS (cuadrado con flecha hacia arriba) - referencia visual para las instrucciones, Safari no permite disparar el prompt de instalacion por codigo. */
function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline -mt-0.5"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <rect x="4" y="12" width="16" height="9" rx="2" />
    </svg>
  );
}
