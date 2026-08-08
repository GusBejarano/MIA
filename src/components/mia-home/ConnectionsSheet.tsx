"use client";

import { useEffect, useState } from "react";
import type { RelationType } from "@/lib/mia/store";
import CloseButton from "@/components/mia/CloseButton";

type ProgramOption = { id: string; name: string; color: string };
type CityOption = { value: string; label: string; count: number };
type Connection = {
  programId: string;
  programName: string;
  tipoRelacion: RelationType | null;
  esPrincipal: boolean;
};

const RELATION_LABELS: Record<RelationType, string> = {
  afiliado: "Afiliado",
  empleado: "Empleado",
  beneficiario: "Beneficiario",
  estudiante: "Estudiante",
};
const RELATION_TYPES = Object.keys(RELATION_LABELS) as RelationType[];

/**
 * "Mis conexiones" - agregar mas benefactores/ciudades y elegir cual
 * conexion es la principal (rule 5 del prompt: se controla desde la app,
 * atomico via RPC set_principal_connection - ver store.ts).
 */
export default function ConnectionsSheet({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [cities, setCities] = useState<string[] | null>(null);
  const [allPrograms, setAllPrograms] = useState<ProgramOption[] | null>(null);
  const [allCities, setAllCities] = useState<CityOption[] | null>(null);
  const [addingProgramId, setAddingProgramId] = useState<string | null>(null);
  const [addingCity, setAddingCity] = useState(false);
  const [busy, setBusy] = useState(false);

  function reload() {
    fetch(`/api/mia/onboarding/profile?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        setConnections(data.connections ?? []);
        setCities(data.cities ?? []);
      });
  }

  useEffect(() => {
    reload();
    fetch("/api/mia/onboarding/catalog")
      .then((r) => r.json())
      .then((data) => {
        setAllPrograms(data.programs ?? []);
        setAllCities(data.cities ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function connectProgram(programId: string, relation: RelationType) {
    setBusy(true);
    try {
      await fetch("/api/mia/onboarding/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          programId,
          tipoRelacion: relation,
          esPrincipal: (connections ?? []).length === 0,
        }),
      });
      setAddingProgramId(null);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function makePrincipal(programId: string, relation: RelationType) {
    setBusy(true);
    try {
      await fetch("/api/mia/onboarding/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, programId, tipoRelacion: relation, esPrincipal: true }),
      });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function addCity(value: string) {
    setBusy(true);
    try {
      await fetch("/api/mia/onboarding/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, cities: [value] }),
      });
      setAddingCity(false);
      reload();
    } finally {
      setBusy(false);
    }
  }

  const unconnectedPrograms = (allPrograms ?? []).filter(
    (p) => !(connections ?? []).some((c) => c.programId === p.id)
  );
  const unaddedCities = (allCities ?? []).filter((c) => !(cities ?? []).includes(c.value));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/35">
      <div className="flex h-[82%] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <span className="flex-1 text-sm font-semibold text-mia-ink">Mis conexiones</span>
          <CloseButton onClick={onClose} variant="header" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Benefactores conectados
          </p>
          <div className="flex flex-col gap-2">
            {(connections ?? []).map((c) => (
              <div key={c.programId} className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3">
                <button
                  type="button"
                  disabled={busy || c.esPrincipal || !c.tipoRelacion}
                  onClick={() => c.tipoRelacion && makePrincipal(c.programId, c.tipoRelacion)}
                  aria-label={c.esPrincipal ? "Conexión principal" : "Marcar como principal"}
                  className={c.esPrincipal ? "text-mia-violet" : "text-zinc-300"}
                >
                  ★
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-mia-ink">{c.programName}</p>
                  <p className="text-xs text-zinc-400">
                    {c.tipoRelacion ? RELATION_LABELS[c.tipoRelacion] : ""}
                    {c.esPrincipal ? " · principal" : ""}
                  </p>
                </div>
              </div>
            ))}

            {addingProgramId ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 p-3">
                <p className="mb-2 text-xs text-zinc-500">
                  {allPrograms?.find((p) => p.id === addingProgramId)?.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {RELATION_TYPES.map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      disabled={busy}
                      onClick={() => connectProgram(addingProgramId, rt)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink disabled:opacity-50"
                    >
                      {RELATION_LABELS[rt]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              unconnectedPrograms.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddingProgramId(unconnectedPrograms[0].id)}
                  className="rounded-2xl border border-dashed border-zinc-300 p-3 text-center text-xs font-semibold text-mia-violet"
                >
                  + conectar otro benefactor
                </button>
              )
            )}
          </div>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Ciudades de interés
          </p>
          <div className="flex flex-wrap gap-2">
            {(cities ?? []).map((city) => (
              <span key={city} className="rounded-full bg-gradient-to-r from-mia-violet to-mia-cyan px-3 py-1.5 text-xs font-semibold text-white">
                {city}
              </span>
            ))}
            {addingCity ? (
              unaddedCities.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  disabled={busy}
                  onClick={() => addCity(c.value)}
                  className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-mia-ink disabled:opacity-50"
                >
                  {c.label}
                </button>
              ))
            ) : (
              unaddedCities.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddingCity(true)}
                  className="rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-semibold text-mia-violet"
                >
                  + agregar ciudad
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
