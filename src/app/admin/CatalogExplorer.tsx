"use client";

import { useMemo, useState } from "react";
import DetailSheet from "@/components/mia/DetailSheet";
import type { DetailSheetMessage } from "@/lib/mia/uiMessages";
import type {
  AdminBenefitCard,
  AdminBenefitFull,
  AdminCityOption,
  AdminProgramOption,
} from "@/lib/admin/catalog";
import { loadBenefitsAction, loadBenefitFullAction } from "./catalogActions";
import AdminBenefitGrid from "./AdminBenefitGrid";
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
    // Contexto de admin, no de un beneficiario real - hasRelation=true oculta
    // el boton de "declarar relacion" (no aplica aqui), y no se pasa userId
    // a DetailSheet, asi que ninguna accion de usuario final llega a persistir.
    relation: { programId: "", programName: "", hasRelation: true },
    redemptionInstructions: b.redemption_instructions,
  };
}

// Orden de prioridad de revision (mono-sede primero: mayor riesgo de falso
// positivo, mas barato de verificar - ver v2.0). No es un conteo real
// todavia (benefit_locations recien se esta poblando), es un estimado por
// texto (estimateSiteBucket en catalog.ts) - se reemplaza solo cuando haya
// sedes reales cargadas.
const SITE_BUCKET_ORDER = ["mono-sede", "1-5 sedes", "6-10 sedes", "+10 sedes", "sin clasificar"];

function firstCategory(category: string | null): string {
  return category?.split(",")[0]?.trim() ?? "(sin categoría)";
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
  const [category, setCategory] = useState("");
  const [siteBucket, setSiteBucket] = useState("");
  const [benefits, setBenefits] = useState<AdminBenefitCard[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [selected, setSelected] = useState<AdminBenefitFull | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const set = new Set(benefits.map((b) => firstCategory(b.category)));
    return [...set].sort();
  }, [benefits]);

  const siteBucketOptions = useMemo(() => {
    const set = new Set(benefits.map((b) => b.siteBucket));
    return SITE_BUCKET_ORDER.filter((b) => set.has(b as AdminBenefitCard["siteBucket"]));
  }, [benefits]);

  const filteredBenefits = useMemo(
    () =>
      benefits
        .filter((b) => !category || firstCategory(b.category) === category)
        .filter((b) => !siteBucket || b.siteBucket === siteBucket),
    [benefits, category, siteBucket]
  );

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
    setCategory("");
    setSiteBucket("");
    setBenefits([]);
    setSelected(null);
  }

  function handleProgramChange(value: string) {
    setProgramId(value);
    setCategory("");
    setSiteBucket("");
    setSelected(null);
    loadGrid(city, value);
  }

  async function handleSelectCard(id: string) {
    setShowPreview(false);
    setPanelCollapsed(false);
    const full = await loadBenefitFullAction(id);
    setSelected(full);
  }

  function handleSaved(updated: AdminBenefitFull) {
    setSelected(updated);
    setBenefits((prev) =>
      prev.map((b) =>
        b.id === updated.id
          ? {
              ...b,
              title: updated.title,
              category: updated.category,
              status: updated.status,
              imageUrl: updated.image_url,
            }
          : b
      )
    );
  }

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
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={benefits.length === 0}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Todas las categorías</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={siteBucket}
          onChange={(e) => setSiteBucket(e.target.value)}
          disabled={benefits.length === 0}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">N° de sedes (estimado): todas</option>
          {siteBucketOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 p-4">
        {loadingGrid && <p className="text-sm text-zinc-400">Cargando...</p>}
        {gridError && <p className="text-sm text-red-600">{gridError}</p>}
        {!loadingGrid && city && programId && filteredBenefits.length === 0 && !gridError && (
          <p className="text-sm text-zinc-400">No hay beneficios que coincidan con este filtro.</p>
        )}
        <AdminBenefitGrid
          cards={filteredBenefits.map((b) => ({
            id: b.id,
            title: b.title,
            tag: firstCategory(b.category),
            status: b.status,
            thumbUrl: b.imageUrl,
          }))}
          onSelect={handleSelectCard}
        />
      </div>

      {selected && panelCollapsed && (
        <button
          onClick={() => setPanelCollapsed(false)}
          className="fixed inset-y-0 right-0 z-40 flex w-10 flex-col items-center justify-center gap-2 border-l border-zinc-200 bg-white shadow-xl hover:bg-zinc-50"
          title="Mostrar detalle de beneficio"
        >
          <span className="text-lg">←</span>
        </button>
      )}

      {selected && !panelCollapsed && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-[26rem]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <button
              onClick={() => setPanelCollapsed(true)}
              className="text-lg text-zinc-400 hover:text-zinc-900"
              title="Minimizar"
            >
              →
            </button>
            <h2 className="text-sm font-bold text-zinc-900">Detalle de Beneficio</h2>
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-mia-cyan hover:bg-zinc-50"
            >
              <span>👁️</span> Usuario Final
            </button>
          </div>
          <EditPanel key={selected.id} benefit={selected} onSaved={handleSaved} />
        </div>
      )}

      {selected && showPreview && (
        <DetailSheet message={toPreviewMessage(selected)} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
