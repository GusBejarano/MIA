"use client";

import { useState } from "react";
import BenefitCarousel from "@/components/mia/BenefitCarousel";
import DetailSheet from "@/components/mia/DetailSheet";
import type { CardCarouselMessage, DetailSheetMessage } from "@/lib/mia/uiMessages";
import { colorForString } from "@/lib/mia/colorPalette";
import type { AdminBenefitCard, AdminBenefitFull, AdminCityOption, AdminProgramOption } from "@/lib/admin/catalog";
import { loadBenefitsAction, loadBenefitFullAction } from "./catalogActions";
import EditPanel from "./EditPanel";

function toPreviewMessage(b: AdminBenefitFull): DetailSheetMessage {
  const details: { label: string; value: string }[] = [];
  if (b.valid_until) details.push({ label: "Vigencia", value: `Hasta ${b.valid_until}` });
  if (b.address) details.push({ label: "Dirección", value: b.address });

  return {
    type: "detail_sheet",
    id: b.id,
    title: b.title,
    tag: (b.category ?? "").split(",")[0]?.trim() ?? "",
    description: b.conditions ?? "",
    photoUrl: b.image_url,
    details,
    links: { go: b.how_to_get_there, web: b.company_url, social: b.social_media_url },
    rating: 0,
    // Contexto de admin, no de un beneficiario real - hasSelected=true oculta
    // el boton de "declarar relacion" (no aplica aqui), y no se pasa userId
    // a DetailSheet, asi que ninguna accion de usuario final llega a persistir.
    relation: { programId: "", programName: "", hasRelation: true },
    redemptionInstructions: b.redemption_instructions,
  };
}

export default function CatalogExplorer({
  cities,
  programs,
}: {
  cities: AdminCityOption[];
  programs: AdminProgramOption[];
}) {
  const [city, setCity] = useState("");
  const [programId, setProgramId] = useState("");
  const [benefits, setBenefits] = useState<AdminBenefitCard[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [selected, setSelected] = useState<AdminBenefitFull | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  async function loadGrid(nextCity: string, nextProgramId: string) {
    if (!nextCity || !nextProgramId) {
      setBenefits([]);
      return;
    }
    setLoadingGrid(true);
    setGridError(null);
    try {
      const rows = await loadBenefitsAction(nextProgramId, nextCity);
      setBenefits(rows);
    } catch (err) {
      setGridError(err instanceof Error ? err.message : "No se pudieron cargar los beneficios.");
    } finally {
      setLoadingGrid(false);
    }
  }

  function handleCityChange(value: string) {
    setCity(value);
    setProgramId("");
    setBenefits([]);
    setSelected(null);
  }

  function handleProgramChange(value: string) {
    setProgramId(value);
    setSelected(null);
    loadGrid(city, value);
  }

  async function handleSelectCard(id: string) {
    setShowPreview(false);
    const full = await loadBenefitFullAction(id);
    setSelected(full);
  }

  function handleSaved(updated: AdminBenefitFull) {
    setSelected(updated);
    setBenefits((prev) =>
      prev.map((b) =>
        b.id === updated.id
          ? { ...b, title: updated.title, category: updated.category, status: updated.status, imageUrl: updated.image_url }
          : b
      )
    );
  }

  const carouselMessage: CardCarouselMessage = {
    type: "card_carousel",
    cards: benefits.map((b) => ({
      id: b.id,
      title: b.title,
      tag: (b.category ?? "").split(",")[0]?.trim() ?? b.status,
      color: colorForString(programId),
      thumbUrl: b.imageUrl,
      rating: 0,
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-col gap-2 border-b border-zinc-200 bg-white p-4 sm:flex-row">
        <select
          value={city}
          onChange={(e) => handleCityChange(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Elige una ciudad...</option>
          {cities.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={programId}
          onChange={(e) => handleProgramChange(e.target.value)}
          disabled={!city}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Elige un benefactor...</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 p-4">
        {loadingGrid && <p className="text-sm text-zinc-400">Cargando...</p>}
        {gridError && <p className="text-sm text-red-600">{gridError}</p>}
        {!loadingGrid && city && programId && benefits.length === 0 && !gridError && (
          <p className="text-sm text-zinc-400">No hay beneficios de este benefactor en esta ciudad.</p>
        )}
        <BenefitCarousel message={carouselMessage} onSelect={(id) => handleSelectCard(id)} />
      </div>

      {selected && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-[26rem]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <button
              onClick={() => setShowPreview(true)}
              className="text-xs font-semibold text-mia-cyan underline-offset-2 hover:underline"
            >
              Ver como lo ve el usuario final
            </button>
          </div>
          <EditPanel
            key={selected.id}
            benefit={selected}
            onSaved={handleSaved}
            onClose={() => setSelected(null)}
          />
        </div>
      )}

      {selected && showPreview && (
        <DetailSheet
          message={toPreviewMessage(selected)}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
