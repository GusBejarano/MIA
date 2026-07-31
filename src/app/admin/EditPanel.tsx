"use client";

import { useState } from "react";
import type { AdminBenefitFull, AdminBenefitPatch } from "@/lib/admin/catalog";
import { saveBenefitAction } from "./catalogActions";

const STATUS_OPTIONS = ["pendiente_revision", "activo", "inactivo"] as const;
const DELIVERY_MODE_OPTIONS = ["online", "presencial", "online_y_presencial"] as const;
const CONFIDENCE_OPTIONS = ["confirmada", "estimada", "desconocida"] as const;

type FormState = Omit<AdminBenefitFull, "raw_data" | "updated_at"> & { rawDataText: string };

function toFormState(b: AdminBenefitFull): FormState {
  return {
    id: b.id,
    title: b.title,
    category: b.category,
    city: b.city,
    status: b.status,
    delivery_mode: b.delivery_mode,
    coverage_confidence: b.coverage_confidence,
    conditions: b.conditions,
    access_type: b.access_type,
    redemption_instructions: b.redemption_instructions,
    valid_from: b.valid_from,
    valid_until: b.valid_until,
    image_url: b.image_url,
    company_url: b.company_url,
    social_media_url: b.social_media_url,
    how_to_get_there: b.how_to_get_there,
    address: b.address,
    hours: b.hours,
    research_source: b.research_source,
    rawDataText: JSON.stringify(b.raw_data ?? {}, null, 2),
  };
}

function textField(
  label: string,
  key: keyof FormState,
  form: FormState,
  setForm: (f: FormState) => void,
  multiline = false
) {
  const value = (form[key] as string | null) ?? "";
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-semibold text-zinc-500">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}

export default function EditPanel({
  benefit,
  onSaved,
}: {
  benefit: AdminBenefitFull;
  onSaved: (updated: AdminBenefitFull) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(benefit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downgradeWarning, setDowngradeWarning] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setDowngradeWarning(false);

    let rawData: unknown;
    try {
      rawData = JSON.parse(form.rawDataText || "{}");
    } catch {
      setError("El JSON de raw_data no es valido - corrigelo antes de guardar.");
      setSaving(false);
      return;
    }

    const patch: AdminBenefitPatch = {
      title: form.title,
      category: form.category,
      city: form.city,
      status: form.status,
      delivery_mode: form.delivery_mode,
      coverage_confidence: form.coverage_confidence,
      conditions: form.conditions,
      access_type: form.access_type,
      redemption_instructions: form.redemption_instructions,
      valid_from: form.valid_from,
      valid_until: form.valid_until,
      image_url: form.image_url,
      company_url: form.company_url,
      social_media_url: form.social_media_url,
      how_to_get_there: form.how_to_get_there,
      address: form.address,
      hours: form.hours,
      research_source: form.research_source,
      raw_data: rawData,
    };

    try {
      const updated = await saveBenefitAction(benefit.id, patch);
      if (form.status === "activo" && updated.status === "pendiente_revision") {
        setDowngradeWarning(true);
      }
      setForm(toFormState(updated));
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {downgradeWarning && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          Guardado, pero quedó en <strong>pendiente_revision</strong> en vez de activo: la cobertura
          de ciudad no cumple la regla de v2.0 (necesita delivery_mode=&quot;online&quot; o
          coverage_confidence=&quot;confirmada&quot; para dejar la ciudad reducida a un solo país).
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Básico</legend>
        {textField("Título", "title", form, setForm)}
        {textField("Categoría", "category", form, setForm)}
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-zinc-500">Estado</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Cobertura (v2.0)</legend>
        {textField("Ciudad(es)", "city", form, setForm)}
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-zinc-500">Modo de entrega</span>
          <select
            value={form.delivery_mode ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                delivery_mode: (e.target.value || null) as FormState["delivery_mode"],
              })
            }
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          >
            <option value="">(sin definir)</option>
            {DELIVERY_MODE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-zinc-500">Confianza de cobertura</span>
          <select
            value={form.coverage_confidence ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                coverage_confidence: (e.target.value || null) as FormState["coverage_confidence"],
              })
            }
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          >
            <option value="">(sin definir)</option>
            {CONFIDENCE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Condiciones</legend>
        {textField("Condiciones", "conditions", form, setForm, true)}
        {textField("Tipo de acceso", "access_type", form, setForm)}
        {textField("Cómo disfrutarlo", "redemption_instructions", form, setForm, true)}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="mb-1 block font-semibold text-zinc-500">Vigente desde</span>
            <input
              type="date"
              value={form.valid_from ?? ""}
              onChange={(e) => setForm({ ...form, valid_from: e.target.value || null })}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-semibold text-zinc-500">Vigente hasta</span>
            <input
              type="date"
              value={form.valid_until ?? ""}
              onChange={(e) => setForm({ ...form, valid_until: e.target.value || null })}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Enlaces</legend>
        {textField("Imagen (URL)", "image_url", form, setForm)}
        {textField("Sitio web", "company_url", form, setForm)}
        {textField("Redes sociales", "social_media_url", form, setForm)}
        {textField("Cómo llegar (Google Maps)", "how_to_get_there", form, setForm)}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Ubicación física</legend>
        {textField("Dirección", "address", form, setForm)}
        {textField("Horario", "hours", form, setForm)}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Meta</legend>
        {textField("Fuente de investigación", "research_source", form, setForm, true)}
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-zinc-500">raw_data (JSON)</span>
          <textarea
            value={form.rawDataText}
            onChange={(e) => setForm({ ...form, rawDataText: e.target.value })}
            rows={6}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 font-mono text-xs"
          />
        </label>
      </fieldset>

      <button
        onClick={handleSave}
        disabled={saving}
        className="sticky bottom-0 rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </div>
  );
}
