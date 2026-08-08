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
import DetailSheet from "@/components/mia/DetailSheet";
import type { GridCard } from "@/components/mia-home/BenefitGrid";
import type { AvatarKey } from "@/lib/mia/store";
import type { DetailSheetMessage } from "@/lib/mia/uiMessages";
import { suggestionsChatGreeting } from "@/lib/mia/copy";

type Step = "welcome" | "connect" | "cities" | "tabs";

// Lista de indicativos (hoy un solo valor, ya seleccionado por defecto) -
// separar el indicativo del numero local estandariza como queda el
// telefono en BD sin pedirselo al usuario como un campo aparte. Sin esto,
// el mismo numero real podia guardarse distinto segun si la persona
// escribia el +57 o no ("+573123335744" vs "3123335744"), y como
// hashPhone (phoneHash.ts) hashea el string tal cual, esos dos hashean
// distinto - el mismo beneficiario podia terminar con dos filas de
// usuario separadas en BD. Union de codigo+numero solo pasa aca, antes de
// mandarlo al backend - la BD sigue guardando el mismo formato de siempre
// ("+57..."), sin ningun cambio de esquema.
const COUNTRY_CODES = [{ code: "+57", label: "🇨🇴 Colombia (+57)" }];

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
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0].code);
  const [localPhoneInput, setLocalPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatBootstrap, setChatBootstrap] = useState<ChatBootstrap | null>(null);
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false);
  // true desde el primer open en adelante, sin importar si fue el boton
  // flotante o "Sugerencias" vacio - ver hasOpenedOnce en ChatOverlay.tsx
  // (continuidad real de la conversacion al reabrir).
  const [chatHasOpenedOnce, setChatHasOpenedOnce] = useState(false);
  const [chatFilter, setChatFilter] = useState<ChatFilter | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [directDetail, setDirectDetail] = useState<DetailSheetMessage | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [topBenefactor, setTopBenefactor] = useState<{ name: string; extraCount: number } | null>(null);
  const [avatar, setAvatar] = useState<AvatarKey>("negro");
  // Sube cada vez que algo que afecta "Conectados"/"Preferidos" cambia:
  // cerrar "Mis conexiones" (conectar/desconectar benefactor, agregar/
  // quitar ciudad) o calificar un beneficio con estrellas - HomeTabs.tsx
  // usa esto para volver a pedir los beneficios, nunca quedan
  // desactualizados hasta el proximo refresco de pagina.
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
          profile?: { avatar: AvatarKey; name?: string | null };
        }) => {
          setCities(data.cities ?? []);
          setAvatar(data.profile?.avatar ?? "negro");
          setUserName(data.profile?.name ?? null);
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
    // Solo digitos del numero local (por si alguien escribe espacios o
    // guiones) + el indicativo elegido - un solo formato consistente para
    // TODOS, sin importar como lo haya escrito la persona.
    const localDigits = localPhoneInput.replace(/\D/g, "");
    const trimmedPhone = localDigits ? `${countryCode}${localDigits}` : "";
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

      // El numero de WhatsApp es el identificador real (no el dispositivo -
      // ver feedback explicito): si este numero ya tiene benefactores o
      // ciudades guardados en Supabase, es un regreso aunque este
      // dispositivo/navegador nunca haya completado el onboarding antes
      // (celular nuevo, cache borrado, etc.) - se salta OnB-2/OnB-3.
      const profileRes = await fetch(`/api/mia/onboarding/profile?userId=${data.userId}`);
      const profileData = await profileRes.json();
      const alreadyOnboarded =
        (profileData.connections?.length ?? 0) > 0 || (profileData.cities?.length ?? 0) > 0;

      if (alreadyOnboarded) {
        rememberUser(trimmedPhone, data.userId);
        setStep("tabs");
      } else {
        setStep("connect");
      }
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

  // Tocar una tarjeta en un grid muestra el detalle directo - reutiliza el
  // mismo motor de chat (viewBenefitDetail via callMia con viewDetailId,
  // ver onboarding.ts) para no duplicar exposicion/tip/badge de relacion,
  // pero SIN abrir el overlay de conversacion alrededor (pedido explicito:
  // "no quiero que abra el chat con MIA, sino que lo despliegue directo").
  // El estado de la sesion de fondo se actualiza igual, para que si luego
  // se abre el chat de verdad (boton flotante) siga desde aqui.
  async function viewDetail(id: string, title: string) {
    if (!chatBootstrap) return;
    setDetailLoading(true);
    try {
      const { ui, state } = await callMia({
        phone,
        message: `Quiero ver el detalle de "${title}"`,
        state: chatBootstrap.state,
        viewDetailId: id,
      });
      setChatBootstrap((b) => (b ? { ...b, state } : b));
      const detail = ui.find((u): u is DetailSheetMessage => u.type === "detail_sheet");
      if (detail) setDirectDetail(detail);
    } catch (err) {
      console.error("No se pudo cargar el detalle del beneficio:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCardCarouselResult(
    carousel: {
      cards: {
        id: string;
        title: string;
        tag: string;
        thumbUrl: string | null;
        rating?: number;
        /** Solo presente en carruseles de busqueda de negocio/sugerencias - ver relationBadge en uiMessages.ts. */
        relationBadge?: "activa" | "sin_relacion";
      }[];
    },
    queryLabel: string
  ) {
    // Sin cityLabel/discountPercent aqui: el carrusel del chat (produccion,
    // sin tocar) no los trae - la tarjeta simplemente no muestra esos dos
    // badges para resultados de busqueda por chat, degrada con gracia.
    // `connected` solo lo trae relationBadge (busqueda de negocio o
    // sugerencias) - un carrusel de categoria normal no lo trae, ambos
    // casos (undefined o "sin_relacion") se ven identicos (badge oculto),
    // asi que no hay regresion para ese caso.
    const cards: GridCard[] = carousel.cards.map((c) => ({
      id: c.id,
      title: c.title,
      tag: c.tag,
      thumbUrl: c.thumbUrl,
      rating: c.rating,
      connected: c.relationBadge === "activa",
    }));
    // "Sugerencias" no acumula: chatFilter es un solo valor, siempre
    // reemplaza el anterior (nunca conviven dos busquedas a la vez ahi,
    // regla del ajuste) - "Conectados" no se ve afectado por este cambio,
    // ese tab ya no consume chatFilter (se elimino junto con "Explorar").
    setChatFilter({ label: queryLabel, cards });
  }

  // Declarar relacion desde el detalle (DetailSheet.tsx) guardaba en BD
  // bien, pero la tarjeta en "Sugerencias" seguia mostrando "sin
  // relacion" hasta la proxima busqueda - el badge "connected" de cada
  // tarjeta es una foto del momento en que se armo el carrusel (ver
  // handleCardCarouselResult), no se releia solo (bug reportado). Marca
  // TODAS las tarjetas de ese mismo benefactor ya visibles en Sugerencias,
  // no solo la que se estaba viendo.
  function handleRelationDeclared(programName: string) {
    setChatFilter((prev) =>
      prev
        ? { ...prev, cards: prev.cards.map((c) => (c.tag === programName ? { ...c, connected: true } : c)) }
        : prev
    );
  }

  // Unico lugar que abre el chat (boton flotante via onOpenChange, o el
  // tab "Sugerencias" vacio) - marca chatHasOpenedOnce en el mismo evento,
  // nunca en un efecto (ver hasOpenedOnce en ChatOverlay.tsx).
  function openChat() {
    setChatOverlayOpen(true);
    setChatHasOpenedOnce(true);
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
            <div className="flex w-full gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="shrink-0 rounded-full border border-zinc-200 px-3 py-3 text-base text-mia-ink outline-none focus:border-mia-violet"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="300 000 0000"
                value={localPhoneInput}
                onChange={(e) => setLocalPhoneInput(e.target.value)}
                className="w-full min-w-0 rounded-full border border-zinc-200 px-5 py-3 text-center text-base text-mia-ink outline-none focus:border-mia-violet"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !localPhoneInput.trim() || !nameInput.trim()}
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

        <button
          type="button"
          onClick={() => setConnectionsOpen(true)}
          className="flex w-fit shrink-0 max-w-[40%] items-center gap-1.5 truncate rounded-full bg-zinc-100 px-3 py-1.5 text-left text-sm font-medium text-mia-ink"
        >
          <span aria-hidden>★</span>
          <span className="truncate">
            {!topBenefactor
              ? "Elige tu Benefactor"
              : topBenefactor.extraCount > 0
                ? `${topBenefactor.name} +${topBenefactor.extraCount}`
                : topBenefactor.name}
          </span>
          <span className="text-zinc-400" aria-hidden>▾</span>
        </button>

        <div className="flex-1" />
        {/* Nombre truncado con CSS (ellipsis), no un slice(0,N) fijo en JS -
            el ancho real de cada letra varia, un tope de caracteres fijo se
            veria bien para algunos nombres y cortado de mas/de menos para
            otros. Ancho igual al avatar (w-10) para que quede centrado
            debajo sin ensanchar esta columna. */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex shrink-0 flex-col items-center gap-0.5"
        >
          <AvatarCircle avatar={avatar} size="sm" />
          {userName && (
            <span className="w-10 truncate text-center text-[9px] leading-none text-zinc-400">
              {userName}
            </span>
          )}
        </button>
      </header>

      <HomeTabs
        userId={userId}
        chatFilter={chatFilter}
        onClearChatFilter={() => setChatFilter(null)}
        onSelectBenefit={viewDetail}
        onOpenSuggestionsChat={openChat}
        refreshKey={connectionsVersion}
      />

      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-full bg-white px-4 py-2 text-sm text-mia-ink shadow-lg">Cargando...</div>
        </div>
      )}

      {directDetail && (
        <DetailSheet
          message={directDetail}
          userId={userId}
          onClose={() => setDirectDetail(null)}
          onLocationGranted={() =>
            setChatBootstrap((b) =>
              b ? { ...b, state: { ...b.state, profile: { ...b.state.profile, locationPermissionGranted: true } } } : b
            )
          }
          onRatingChanged={() => setConnectionsVersion((v) => v + 1)}
          onRelationDeclared={handleRelationDeclared}
        />
      )}

      {/* El chat flotante de dev 2.5 ya no maneja navegacion de
          benefactores/ciudad/categoria por chips (decision explicita: "ya
          ese manejo no lo vamos a tener con MIA") - siempre en modo
          suggestionsOnly, con el mismo saludo de busqueda libre, sin
          importar si se abrio desde el boton flotante o desde el tab
          "Sugerencias" vacio. ChatOverlay mantiene la conversacion
          montada tras el primer open (continuidad real: reabrir el chat
          ya no perdia el historial, bug reportado). */}
      <ChatOverlay
        phone={phone}
        bootstrap={chatBootstrap}
        isOpen={chatOverlayOpen}
        hasOpenedOnce={chatHasOpenedOnce}
        onOpenChange={(open) => {
          setChatOverlayOpen(open);
          if (open) setChatHasOpenedOnce(true);
        }}
        greetingOverride={suggestionsChatGreeting(userName)}
        suggestionsOnly
        onCardCarouselResult={handleCardCarouselResult}
        onRatingChanged={() => setConnectionsVersion((v) => v + 1)}
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
