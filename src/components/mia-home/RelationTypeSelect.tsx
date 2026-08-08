"use client";

import { useState } from "react";
import type { RelationType } from "@/lib/mia/store";

export const RELATION_LABELS: Record<RelationType, string> = {
  afiliado: "Afiliado",
  empleado: "Empleado",
  beneficiario: "Beneficiario",
  estudiante: "Estudiante",
  egresado: "Egresado",
};

export const RELATION_TYPES = Object.keys(RELATION_LABELS) as RelationType[];

/**
 * Selector de tipo de relacion con un benefactor - lista de seleccion
 * unica de verdad (select nativo, un picker familiar en cualquier celular)
 * en vez de una fila de chips envueltos, que no se leia como una lista de
 * opciones (feedback de la primera prueba en vivo, dev 2.5). Confirmacion
 * explicita con un boton, no autoguardado al cambiar el select - evita
 * guardar por accidente el placeholder o un valor tocado sin querer.
 */
export default function RelationTypeSelect({
  onConfirm,
  busy,
}: {
  onConfirm: (relation: RelationType) => void;
  busy?: boolean;
}) {
  const [value, setValue] = useState<RelationType | "">("");

  return (
    <div className="flex gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value as RelationType)}
        className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-mia-ink"
      >
        <option value="" disabled>
          Elige tu relación...
        </option>
        {RELATION_TYPES.map((rt) => (
          <option key={rt} value={rt}>
            {RELATION_LABELS[rt]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!value || busy}
        onClick={() => value && onConfirm(value)}
        className="shrink-0 rounded-xl bg-gradient-to-r from-mia-violet to-mia-cyan px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Guardar
      </button>
    </div>
  );
}
