"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { callMia, claimVisit } from "@/lib/mia/apiClient";
import OnboardingConnect from "@/components/mia-home/OnboardingConnect";
import OnboardingCities from "@/components/mia-home/OnboardingCities";
import HomeTabs, { type ChatFilter } from "@/components/mia-home/HomeTabs";
import ChatOverlay, { type ChatBootstrap } from "@/components/mia-home/ChatOverlay";
import ConnectionsSheet from "@/components/mia-home/ConnectionsSheet";
import ProfileSheet from "@/components/mia-home/ProfileSheet";
import AvatarCircle from "@/components/mia-home/AvatarCircle";
import { GearIcon } from "@/components/mia/SheetIcons";
import type { GridCard } from "@/components/mia-home/BenefitGrid";
import type { AvatarKey } from "@/lib/mia/store";

type Step = "welcome" | "connect" | "cities" | "tabs";

// Recuerda phone+userId de este dispositivo (dev 2.5) - a diferencia de
// REMEMBERED_PHONE_KEY (MiaChat.tsx, solo precarga el input), esto salta
// directo a los tabs en un regreso: OnB-1/2/3 no vuelven a mostrarse.
const REMEMBERED_USER_KEY = "mia_home_user";

function getRememberedUser(): { phone: string; userId: string } | null {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function rememberUser(phone: string, userId: string) {
  window.localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify({ phone, userId }));
}

/**
 * Shell nuevo del home (dev 2.5) - onboarding de 4 pasos + tabs de retorno.
 * No toca OnboardingSession/freeChat/api/mia: el chat sigue siendo el mismo
 * motor de siempre, montado aparte (ChatOverlay -> ChatPanel) y arrancado
 * en segundo plano al entrar a los tabs para no retrasar session_started
 * hasta que la persona toque el boton flotante.
 */
export default function MiaHome() {
  const [step, setStep] = useState<Step>("welcome");
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatBootstrap, setChatBootstrap] = useState<ChatBootstrap | null>(null);
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false);
  const [chatFilter, setChatFilter] = useState<ChatFilter | null>(null);
  const [pendingDetail, setPendingDetail] = useState<{ id: string; title: string } | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [topBenefactor, setTopBenefactor] = useState<{ name: string; extraCount: number } | null>(null);
  const [avatar, setAvatar] = useState<AvatarKey>("negro");
  // Sube cada vez que se cierra "Mis conexiones" - HomeTabs usa esto para
  // volver a pedir los beneficios (conectar/desconectar un benefactor o
  // agregar/quitar una ciudad debe reflejarse de una vez, no solo en el
  // proximo refresco de pagina).
  const [connectionsVersion, setConnectionsVersion] = useState(0);

  // Ciudad(es), benefactor con mas estrellas (para el pill del header, ver
  // feedback de la segunda prueba en vivo) y avatar (el boton de perfil
  // mostraba el logo de MIA fijo en vez del avatar real - tambien reportado).
  function loadHeaderData(uid: string) {
    fetch(`/api/mia/onboarding/profile?userId=${uid}`)
      .then((r) => r.json())
      .then(
        (data: {
          cities?: string[];
          connections?: { programName: string; prioridad: number }[];
          profile?: { avatar: AvatarKey };
        }) => {
          setCities(data.cities ?? []);
          setAvatar(data.profile?.avatar ?? "negro");
          const sorted = [...(data.connections ?? [])].sort((a, b) => b.prioridad - a.prioridad);
          setTopBenefactor(
            sorted.length === 0
              ? null
              : { name: sorted[0].programName, extraCount: sorted.length - 1 }
          );
        }
      )
      .catch(() => {});
  }

  useEffect(() => {
    fetch("/api/health").catch(() => {});
  }, []);

  useEffect(() => {
    const remembered = getRememberedUser();
    if (remembered) {
      // Lectura de localStorage solo es posible despues del primer render
      // (el HTML del servidor nunca conoce el valor guardado en ESE
      // navegador) - mismo patron que el telefono recordado en
      // MiaChat.tsx, aqui con 3 campos en vez de 1.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhone(remembered.phone);
      setUserId(remembered.userId);
      setStep("tabs");
    }
  }, []);

  useEffect(() => {
    if (step === "tabs" && userId) loadHeaderData(userId);
  }, [step, userId]);

  // Bootstrap del chat en segundo plano al entrar a los tabs - un solo
  // session_started por visita, sin importar si la persona llega ahi por
  // onboarding nuevo o por ser un regreso (ver claimVisit en apiClient.ts).
  useEffect(() => {
    if (step !== "tabs" || !phone || chatBootstrap) return;
    callMia({ phone, logVisit: claimVisit() })
      .then(({ reply, ui, navLinks, state }) => setChatBootstrap({ reply, ui, navLinks, state }))
      .catch((err) => console.error("No se pudo arrancar el chat en segundo plano:", err));
  }, [step, phone, chatBootstrap]);

  async function handleWelcomeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedPhone = phoneInput.trim();
    const trimmedName = nameInput.trim();
    if (!trimmedPhone || !trimmedName || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mia/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmedPhone, name: trimmedName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo salió mal");
      setPhone(trimmedPhone);
      setUserId(data.userId);
      setStep("connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setLoading(false);
    }
  }

  function finishOnboarding() {
    if (userId) rememberUser(phone, userId);
    setStep("tabs");
  }

  function handleSelectBenefit(id: string, title: string) {
    setPendingDetail({ id, title });
    setChatOverlayOpen(true);
  }

  function handleCardCarouselResult(
    carousel: { cards: { id: string; title: string; tag: string; thumbUrl: string | null }[] },
    queryLabel: string
  ) {
    const cards: GridCard[] = carousel.cards.map((c) => ({
      id: c.id,
      title: c.title,
      tag: c.tag,
      thumbUrl: c.thumbUrl,
    }));
    setChatFilter({ label: queryLabel, cards });
  }

  if (step === "welcome") {
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
          <p className="-mt-4 text-sm text-zinc-400">by Descuentos Inteligentes</p>
          <p className="max-[380px]:text-xl text-2xl font-semibold leading-snug text-mia-ink">
            ¿Sabías que existen descuentos esperando por ti?
          </p>
          <p className="max-w-md text-lg leading-8 text-zinc-600">
            MIA te ayuda a encontrarlos y usarlos, donde y cuando los necesitas.
          </p>

          <form onSubmit={handleWelcomeSubmit} className="mt-2 flex w-full max-w-sm flex-col gap-3">
            <input
              type="text"
              placeholder="Tu nombre"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full rounded-full border border-zinc-200 px-5 py-3 text-center text-base text-mia-ink outline-none focus:border-mia-violet"
            />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+57 300 000 0000"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full rounded-full border border-zinc-200 px-5 py-3 text-center text-base text-mia-ink outline-none focus:border-mia-violet"
            />
            <button
              type="submit"
              disabled={loading || !phoneInput.trim() || !nameInput.trim()}
              className="w-full rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-5 py-3 text-base font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {loading ? "Conectando..." : "Empezar a chatear"}
            </button>
          </form>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <p className="text-xs text-zinc-400">
            Tu número solo se usa para reconocerte entre visitas - nunca se comparte
          </p>
        </main>
      </div>
    );
  }

  if (!userId) return null;

  if (step === "connect") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-8">
        <OnboardingConnect userId={userId} onContinue={() => setStep("cities")} />
      </div>
    );
  }

  if (step === "cities") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-8">
        <OnboardingCities userId={userId} onContinue={finishOnboarding} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 pt-3">
        <Image src="/logo/mia-icon.png" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
        <span className="mia-gradient-text text-base font-bold">mia</span>
        <span className="text-[11px] text-zinc-400">by Descuentos Inteligentes</span>
      </div>

      <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-zinc-100 px-4 py-3">
        <button
          type="button"
          onClick={() => setConnectionsOpen(true)}
          className="flex w-fit shrink-0 max-w-[40%] items-center gap-1.5 truncate rounded-full bg-zinc-100 px-3 py-1.5 text-left text-sm font-medium text-mia-ink"
        >
          <span aria-hidden>📍</span>
          <span className="truncate">
            {cities.length === 0
              ? "Elige tu ciudad"
              : cities.length === 1
                ? cities[0]
                : `${cities[0]} +${cities.length - 1}`}
          </span>
          <span className="text-zinc-400" aria-hidden>▾</span>
        </button>

        {topBenefactor && (
          <button
            type="button"
            onClick={() => setConnectionsOpen(true)}
            className="flex w-fit shrink-0 max-w-[40%] items-center gap-1.5 truncate rounded-full bg-zinc-100 px-3 py-1.5 text-left text-sm font-medium text-mia-ink"
          >
            <span aria-hidden>★</span>
            <span className="truncate">
              {topBenefactor.extraCount > 0
                ? `${topBenefactor.name} +${topBenefactor.extraCount}`
                : topBenefactor.name}
            </span>
            <span className="text-zinc-400" aria-hidden>▾</span>
          </button>
        )}

        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setConnectionsOpen(true)}
          aria-label="Mis conexiones"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-mia-ink"
        >
          <GearIcon size={16} />
        </button>
        <div className="shrink-0">
          <AvatarCircle avatar={avatar} size="sm" onClick={() => setProfileOpen(true)} />
        </div>
      </header>

      <HomeTabs
        userId={userId}
        chatFilter={chatFilter}
        onClearChatFilter={() => setChatFilter(null)}
        onSelectBenefit={handleSelectBenefit}
        refreshKey={connectionsVersion}
      />

      <ChatOverlay
        phone={phone}
        bootstrap={chatBootstrap}
        isOpen={chatOverlayOpen}
        onOpenChange={setChatOverlayOpen}
        autoOpenDetail={pendingDetail}
        onAutoOpenDetailConsumed={() => setPendingDetail(null)}
        onCardCarouselResult={handleCardCarouselResult}
      />

      {connectionsOpen && (
        <ConnectionsSheet
          userId={userId}
          onClose={() => {
            setConnectionsOpen(false);
            loadHeaderData(userId);
            setConnectionsVersion((v) => v + 1);
          }}
        />
      )}
      {profileOpen && (
        <ProfileSheet
          userId={userId}
          onClose={() => {
            setProfileOpen(false);
            loadHeaderData(userId);
          }}
        />
      )}
    </div>
  );
}
