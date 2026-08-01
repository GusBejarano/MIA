// Logica pura (sin dependencias de Supabase/servidor) - a proposito en un
// archivo separado de catalog.ts, que importa el cliente service_role
// (supabaseClient.ts) y por eso NO se puede importar como valor desde un
// componente "use client" (EditPanel.tsx la necesita para el preview en
// vivo del gate de cobertura, sin esperar a guardar).

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[0300-036f]/g, "");
}

/** Espejo en TS de la funcion SQL normalize_city_list (verificado contra la
 * definicion real de Supabase el 2026-07-31 - si esa funcion cambia, esto
 * hay que actualizarlo tambien): separa por coma, minusculas sin tildes,
 * quita vacios y "colombia" - si no queda nada, cae de vuelta a
 * ['colombia'] (representa cobertura nacional/sin ciudad especifica). */
function normalizeCityListPreview(raw: string | null): string[] {
  const pieces = (raw ?? "").split(",").map((p) => stripAccents(p.trim().toLowerCase()));
  const filtered = pieces.filter((p) => p !== "" && p !== "colombia");
  return filtered.length > 0 ? filtered : ["colombia"];
}

export type CoverageGatePreview = { willGate: boolean; message: string };

/** Espejo en TS del gate "Colombia sin confirmar" del trigger
 * check_benefit_city_coverage (mismo criterio, verificado contra la
 * definicion real - ver normalizeCityListPreview). Solo cubre ESE gate, no
 * el chequeo de zonas no reconocidas en city_regions (una excepcion dura
 * aparte, no un ajuste silencioso de status). Se recalcula en el cliente
 * en cada cambio de los selectores, sin guardar - el aviso posterior al
 * guardado (ya existente) sigue siendo la fuente de verdad real. */
export function previewCoverageGate(
  city: string | null,
  deliveryMode: string | null,
  coverageConfidence: string | null
): CoverageGatePreview {
  const cityList = normalizeCityListPreview(city);
  const isBareColombia = cityList.length === 1 && cityList[0] === "colombia";
  const willGate = isBareColombia && deliveryMode !== "online" && coverageConfidence !== "confirmada";

  return willGate
    ? {
        willGate: true,
        message:
          'Si guardas con estado "activo", el sistema lo cambiará automáticamente a "pendiente_revision": la ciudad queda reducida a "Colombia" sin que la cobertura esté confirmada. Marca "online" o "confirmada" (con evidencia real) para evitarlo.',
      }
    : {
        willGate: false,
        message: 'Si guardas con estado "activo", se acepta sin problema con esta cobertura.',
      };
}
