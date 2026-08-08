"use client";

import { useEffect, useState } from "react";
import type { RelationType } from "@/lib/mia/store";
import RelationTypeSelect, { RELATION_LABELS } from "@/components/mia-home/RelationTypeSelect";

type ProgramOption = { id: string; name: string; color: string };

/**
 * OnB-2: "Conecta con tus Benefactores" - tocar "Conectar" revela el
 * selector de tipo de relacion (RelationTypeSelect.tsx, lista de seleccion
 * unica de verdad), elegir y confirmar guarda de una vez (POST
 * /api/mia/onboarding/connect). La prioridad (1-3 estrellas, ver
 * ConnectionsSheet.tsx) se ajusta despues desde "Mis conexiones" - aqui
 * todas quedan en 1 por defecto.
 */
export default function OnboardingConnect({
  userId,
  onContinue,
}: {
  userId: string;
  onContinue: () => void;
}) {
  const [programs, setPrograms] = useState<ProgramOption[] | null>(null);
  const [connected, setConnected] = useState<Record<string, RelationType>>({});
  const [activeProgramId, setActiveProgramId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mia/onboarding/catalog")
      .then((r) => r.json())
      .then((data) => setPrograms(data.programs ?? []))
      .catch(() => setError("No pudimos cargar los benefactores"));
  }, []);

  async function confirmRelation(programId: string, relation: RelationType) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mia/onboarding/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, programId, tipoRelacion: relation }),
      });
      if (!res.ok) throw new Error();
      setConnected((prev) => ({ ...prev, [programId]: relation }));
      setActiveProgramId(null);
    } catch {
      setError("No se pudo guardar la conexión, intenta de nuevo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-center">
      <h2 className="text-xl font-semibold text-mia-ink">Conecta con tus Benefactores</h2>
      <p className="text-sm text-zinc-500">
        MIA te muestra mejor lo tuyo cuando sabe con quién tienes relación
      </p>

      <div className="flex flex-col gap-2 text-left">
        {!programs && <p className="text-sm text-zinc-400">Cargando...</p>}

        {programs?.map((p) => {
          const relation = connected[p.id];
          return (
            <div key={p.id} className="rounded-2xl border border-zinc-200 p-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: p.color }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-mia-ink">{p.name}</p>
                  {relation && (
                    <p className="text-xs text-mia-violet">{RELATION_LABELS[relation]}</p>
                  )}
                </div>
                {!relation && (
                  <button
                    type="button"
                    onClick={() => setActiveProgramId(p.id === activeProgramId ? null : p.id)}
                    className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink"
                  >
                    Conectar
                  </button>
                )}
              </div>

              {activeProgramId === p.id && !relation && (
                <div className="mt-3">
                  <RelationTypeSelect onConfirm={(rt) => confirmRelation(p.id, rt)} busy={saving} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={onContinue}
        disabled={Object.keys(connected).length === 0}
        className="w-full rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
      >
        Continuar
      </button>
      <p className="text-xs text-zinc-400">Puedes conectar más benefactores cuando quieras</p>
    </div>
  );
}
