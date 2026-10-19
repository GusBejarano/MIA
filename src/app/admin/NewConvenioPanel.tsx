"use client";

import { useMemo, useState } from "react";
import type { ConvenioExistingBenefit, ConvenioTemplate, MerchantSearchResult, NitLookupResult } from "@/lib/admin/catalog";
import { parseNit } from "@/lib/admin/nit";
import {
  lookupMerchantForConvenioAction,
  searchProvisionalMerchantsByNameAction,
  updateMerchantNitAction,
  createConvenioAction,
  listMerchantLocationsPreviewAction,
} from "./catalogActions";

// "+ Nuevo Convenio" (item N2 de v2.3) - el NIT va primero y decide entre
// 4 casos (ver prompt): NIT existente sin descuentos con este benefactor
// (precarga desde el descuento mas reciente del comercio), NIT existente
// que ya tiene descuentos con este benefactor (abrir o agregar otro), NIT
// no registrado (sugerencias por nombre antes de crear empresa nueva), y
// NIT dentro del rango provisional (sirve para buscar, nunca para crear).
// Es un componente propio (no una rama de EditPanel): antes de guardar no
// hay benefit.id real contra el que validar permisos finos, y mezclar ese
// caso en EditPanel (ya grande, con guards finos por beneficio) hubiera
// sido mas riesgoso que un formulario separado con los mismos campos.

type Step = "nit" | "not_found" | "has_benefits" | "form";

type DraftForm = {
  title: string;
  category: string;
  originalSourceUrl: string;
  status: "pendiente_revision" | "activo" | "inactivo";
  deliveryMode: "" | "online" | "presencial" | "online_y_presencial";
  validFrom: string;
  validUntil: string;
  conditions: string;
  accessType: string;
  redemptionInstructions: string;
  imageUrl: string;
  companyUrl: string;
  socialMediaUrl: string;
};

function emptyDraft(title: string, template: ConvenioTemplate | null): DraftForm {
  return {
    title,
    category: template?.category ?? "",
    originalSourceUrl: "",
    status: "pendiente_revision",
    deliveryMode: "",
    validFrom: "",
    validUntil: "",
    conditions: "",
    accessType: "",
    redemptionInstructions: "",
    imageUrl: template?.imageUrl ?? "",
    companyUrl: template?.companyUrl ?? "",
    socialMediaUrl: template?.socialMediaUrl ?? "",
  };
}

function field(
  label: string,
  value: string,
  onChange: (v: string) => void,
  opts: { placeholder?: string; multiline?: boolean; type?: string } = {}
) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold text-zinc-500">{label}</span>
      {opts.multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          type={opts.type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={opts.placeholder}
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}

export default function NewConvenioPanel({
  programId,
  programName,
  cityLabel,
  onClose,
  onCreated,
}: {
  programId: string;
  programName: string;
  cityLabel: string;
  onClose: () => void;
  onCreated: (benefitId: string) => void;
}) {
  const [step, setStep] = useState<Step>("nit");
  const [nitInput, setNitInput] = useState("");
  const [nitError, setNitError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [resolvedNit, setResolvedNit] = useState("");
  const [otherBenefactors, setOtherBenefactors] = useState<string[]>([]);
  const [existingBenefits, setExistingBenefits] = useState<ConvenioExistingBenefit[]>([]);

  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<MerchantSearchResult[]>([]);
  const [searchingName, setSearchingName] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [form, setForm] = useState<DraftForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sedesPreview, setSedesPreview] = useState<{ id: string; address: string; city: string | null }[]>([]);

  async function loadSedesPreview(mid: string | null) {
    if (!mid) {
      setSedesPreview([]);
      return;
    }
    try {
      const rows = await listMerchantLocationsPreviewAction(mid);
      setSedesPreview(rows);
    } catch {
      setSedesPreview([]);
    }
  }

  function enterForm(
    id: string | null,
    name: string,
    nit: string,
    others: string[],
    template: ConvenioTemplate | null
  ) {
    setMerchantId(id);
    setMerchantName(name);
    setResolvedNit(nit);
    setOtherBenefactors(others);
    setForm(emptyDraft(name, template));
    loadSedesPreview(id);
    setStep("form");
  }

  function routeFound(result: Extract<NitLookupResult, { kind: "found" }>) {
    if (result.sameBenefactorBenefits.length > 0) {
      setMerchantId(result.merchant.id);
      setMerchantName(result.merchant.name);
      setResolvedNit(result.merchant.nit);
      setOtherBenefactors(result.otherBenefactors);
      setExistingBenefits(result.sameBenefactorBenefits);
      setStep("has_benefits");
    } else {
      enterForm(result.merchant.id, result.merchant.name, result.merchant.nit, result.otherBenefactors, result.template);
    }
  }

  async function handleLookup() {
    const parsed = parseNit(nitInput);
    if (!parsed.ok) {
      setNitError(parsed.error);
      return;
    }
    setNitError(null);
    setLooking(true);
    try {
      const result = await lookupMerchantForConvenioAction(parsed.nit, programId);
      if (result.kind === "not_found") {
        if (parsed.provisional) {
          setNitError(
            "Ese NIT es un identificador provisional interno - no se puede usar para crear una empresa nueva."
          );
          return;
        }
        setResolvedNit(parsed.nit);
        setNameQuery("");
        setNameResults([]);
        setStep("not_found");
      } else {
        routeFound(result);
      }
    } catch (err) {
      setNitError(err instanceof Error ? err.message : "No se pudo buscar el NIT.");
    } finally {
      setLooking(false);
    }
  }

  async function handleSearchByName() {
    setSearchingName(true);
    try {
      const rows = await searchProvisionalMerchantsByNameAction(nameQuery);
      setNameResults(rows);
    } catch {
      setNameResults([]);
    } finally {
      setSearchingName(false);
    }
  }

  async function handleAssignNit(target: MerchantSearchResult) {
    setAssigning(true);
    setNitError(null);
    try {
      const result = await updateMerchantNitAction(target.id, resolvedNit);
      if (result.kind === "conflict") {
        setNitError(`Ese NIT ya pertenece a «${result.existingMerchant.name}».`);
        return;
      }
      const fresh = await lookupMerchantForConvenioAction(resolvedNit, programId);
      if (fresh.kind === "found") routeFound(fresh);
    } catch (err) {
      setNitError(err instanceof Error ? err.message : "No se pudo asignar el NIT.");
    } finally {
      setAssigning(false);
    }
  }

  function handleNewCompany() {
    const name = nameQuery.trim() || `Empresa NIT ${resolvedNit}`;
    enterForm(null, name, resolvedNit, [], null);
  }

  function handleAddAnotherDiscount() {
    enterForm(merchantId, merchantName, resolvedNit, otherBenefactors, null);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const benefitId = await createConvenioAction({
        nit: resolvedNit,
        merchantId,
        merchantName,
        programId,
        cityLabel,
        title: form.title.trim(),
        category: form.category.trim(),
        originalSourceUrl: form.originalSourceUrl.trim(),
        status: form.status,
        deliveryMode: form.deliveryMode || null,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
        conditions: form.conditions || null,
        accessType: form.accessType || null,
        redemptionInstructions: form.redemptionInstructions || null,
        imageUrl: form.imageUrl || null,
        companyUrl: form.companyUrl || null,
        socialMediaUrl: form.socialMediaUrl || null,
      });
      onCreated(benefitId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudo crear el convenio.");
    } finally {
      setSaving(false);
    }
  }

  const sedesGroups = useMemo(() => {
    const map = new Map<string, { id: string; address: string; city: string | null }[]>();
    for (const l of sedesPreview) {
      const key = l.city ?? "Sin ciudad";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [sedesPreview]);

  const canSave = Boolean(form && form.title.trim() && form.category.trim() && form.originalSourceUrl.trim());

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-[26rem]">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-bold text-zinc-900">+ Nuevo Convenio</h2>
        <button onClick={onClose} className="text-lg text-zinc-400 hover:text-zinc-900">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-xs">
        <p className="mb-3 text-zinc-500">
          Benefactor: <strong className="text-zinc-700">{programName}</strong> · Ciudad:{" "}
          <strong className="text-zinc-700">{cityLabel}</strong>
        </p>

        {step === "nit" && (
          <div className="flex flex-col gap-2">
            {field("NIT del comercio", nitInput, setNitInput, { placeholder: "900123456" })}
            {nitError && <p className="rounded-lg bg-red-50 p-2 text-red-700">{nitError}</p>}
            <button
              onClick={handleLookup}
              disabled={looking || !nitInput.trim()}
              className="rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
            >
              {looking ? "Buscando..." : "Buscar"}
            </button>
          </div>
        )}

        {step === "has_benefits" && (
          <div className="flex flex-col gap-2">
            <p className="text-zinc-700">
              «{merchantName}» (NIT {resolvedNit}) ya tiene {existingBenefits.length === 1 ? "un descuento" : "descuentos"} con{" "}
              {programName}:
            </p>
            <ul className="flex flex-col gap-2">
              {existingBenefits.map((b) => (
                <li key={b.id} className="rounded-lg border border-zinc-200 p-2">
                  <p className="font-semibold text-zinc-900">{b.title}</p>
                  <p className="text-zinc-500">
                    {b.status}
                    {b.validUntil ? ` · hasta ${b.validUntil}` : ""} · {b.audited ? "Auditado" : "Por auditar"}
                  </p>
                  <button
                    onClick={() => onCreated(b.id)}
                    className="mt-1 font-semibold text-mia-cyan hover:underline"
                  >
                    Abrir este descuento
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={handleAddAnotherDiscount}
              className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-center font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Agregar otro descuento a este convenio
            </button>
          </div>
        )}

        {step === "not_found" && (
          <div className="flex flex-col gap-2">
            <p className="text-zinc-500">
              NIT {resolvedNit}: no está registrado. Antes de crear una empresa nueva, busca si ya existe
              con otro nombre:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchByName()}
                placeholder="Nombre del comercio..."
                className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleSearchByName}
                disabled={searchingName}
                className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                {searchingName ? "Buscando..." : "Buscar"}
              </button>
            </div>
            {nitError && <p className="rounded-lg bg-red-50 p-2 text-red-700">{nitError}</p>}
            {nameResults.length > 0 && (
              <ul className="flex flex-col gap-2">
                {nameResults.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 p-2"
                  >
                    <div>
                      <p className="font-semibold text-zinc-900">{m.name}</p>
                      <p className="text-zinc-500">
                        NIT {m.nit} (provisional) · {m.benefitCount} descuentos · {m.locationCount} sedes
                        {m.benefactors.length > 0 && ` · ${m.benefactors.join(", ")}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAssignNit(m)}
                      disabled={assigning}
                      className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Asignar el NIT {resolvedNit} y continuar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={handleNewCompany}
              className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-center font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Es una empresa nueva
            </button>
          </div>
        )}

        {step === "form" && form && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-zinc-100 p-2">
              <p className="font-semibold text-zinc-700">
                {merchantName} · NIT {resolvedNit} {merchantId ? "" : "(nuevo)"}
              </p>
              {otherBenefactors.length > 0 && (
                <p className="text-zinc-500">Ya tiene convenio con: {otherBenefactors.join(", ")}</p>
              )}
            </div>

            {field("Título", form.title, (v) => setForm({ ...form, title: v }))}
            {field("Categoría", form.category, (v) => setForm({ ...form, category: v }))}

            <fieldset className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/30 p-2">
              <legend className="px-1 text-[10px] font-bold uppercase text-amber-700">
                Propios de este convenio
              </legend>
              <label className="block">
                <span className="mb-1 block font-semibold text-zinc-500">Estado</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as DraftForm["status"] })}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="pendiente_revision">pendiente_revision</option>
                  <option value="activo">activo</option>
                  <option value="inactivo">inactivo</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-semibold text-zinc-500">Ciudad(es)</span>
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-zinc-600">
                  {cityLabel}{" "}
                  <span className="text-[10px] text-zinc-400">(manual hasta que haya sedes)</span>
                </p>
              </label>
              <label className="block">
                <span className="mb-1 block font-semibold text-zinc-500">Modo de entrega</span>
                <select
                  value={form.deliveryMode}
                  onChange={(e) =>
                    setForm({ ...form, deliveryMode: e.target.value as DraftForm["deliveryMode"] })
                  }
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="">(sin definir)</option>
                  <option value="online">online</option>
                  <option value="presencial">presencial</option>
                  <option value="online_y_presencial">online_y_presencial</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {field("Vigente desde", form.validFrom, (v) => setForm({ ...form, validFrom: v }), {
                  type: "date",
                })}
                {field("Vigente hasta", form.validUntil, (v) => setForm({ ...form, validUntil: v }), {
                  type: "date",
                })}
              </div>
              {field("Condiciones", form.conditions, (v) => setForm({ ...form, conditions: v }), {
                multiline: true,
              })}
              {field("Tipo de acceso", form.accessType, (v) => setForm({ ...form, accessType: v }))}
              {field(
                "Cómo disfrutarlo",
                form.redemptionInstructions,
                (v) => setForm({ ...form, redemptionInstructions: v }),
                { multiline: true }
              )}
              <label className="block">
                <span className="mb-1 block font-semibold text-zinc-500">
                  Link oficial de las políticas
                </span>
                <input
                  type="text"
                  value={form.originalSourceUrl}
                  onChange={(e) => setForm({ ...form, originalSourceUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                />
                <span className="mt-1 block text-[10px] text-zinc-400">
                  Solo uso interno - obligatorio para beneficios corporativos.
                </span>
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Enlaces</legend>
              {field("Imagen (URL)", form.imageUrl, (v) => setForm({ ...form, imageUrl: v }))}
              {field("Sitio web", form.companyUrl, (v) => setForm({ ...form, companyUrl: v }))}
              {field("Redes sociales", form.socialMediaUrl, (v) => setForm({ ...form, socialMediaUrl: v }))}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-bold uppercase text-zinc-400">Sedes</legend>
              <p className="rounded-lg bg-zinc-100 p-2 text-zinc-500">
                Guarda el convenio para vincular sedes.
              </p>
              {sedesGroups.length > 0 && (
                <div className="flex flex-col gap-2">
                  {sedesGroups.map(([cityName, locs]) => (
                    <div key={cityName}>
                      <p className="font-semibold text-zinc-500">
                        {cityName} · {locs.length}
                      </p>
                      <ul className="pl-2 text-zinc-400">
                        {locs.map((l) => (
                          <li key={l.id}>{l.address}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>

            {saveError && <p className="rounded-lg bg-red-50 p-2 text-red-700">{saveError}</p>}
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="sticky bottom-0 rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
