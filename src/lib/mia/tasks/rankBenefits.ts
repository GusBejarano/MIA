import { supabase } from "../supabaseClient";
import { getUserProgramIds, getExposedBenefitIds } from "../store";
import { categoryMatchesAffinity, type AffinityCategory } from "../categoryMapping";
import { miaTask } from "../claudeClient";

export type RankedBenefit = {
  id: string;
  title: string;
  sourceProgram: string;
};

export type Recommendation = {
  benefit: RankedBenefit;
  reason: string;
};

type BenefitRow = {
  id: string;
  title: string;
  category: string;
  city: string;
  source_program_id: string;
};

/**
 * El campo `city` en Supabase es texto libre y puede traer varias ciudades
 * separadas por coma (ej. "Cali, Palmira, Colombia"). Hace match si algun
 * pedazo TERMINA en la ciudad buscada (no si la contiene en cualquier
 * posicion) - eso evita que "Cali" matchee "Calima, Colombia". No evita
 * todos los falsos positivos (una ciudad como "Nueva Cali" matchearia
 * igual), pero es mas probable que varien los finales que los inicios.
 */
function cityMatches(dbCity: string, userCity: string): boolean {
  const target = userCity.trim().toLowerCase();
  if (!target) return false;
  return dbCity
    .split(",")
    .map((piece) => piece.trim().toLowerCase())
    .some((piece) => piece.endsWith(target));
}

/**
 * Ranking de las 3 mejores recomendaciones desde el catalogo real de
 * Supabase. La seleccion es mecanica (afinidad + programa + ciudad, sin
 * modelo de lenguaje) - solo se llama a Haiku para redactar la razon
 * especifica de cada recomendacion.
 *
 * Regla de negocio ya aprobada: nunca mas de 3, nunca menos si hay
 * disponibles. No se filtra por `access_type` (categoria A/B/C de Comfandi)
 * porque el onboarding todavia no le pregunta esa categoria al usuario -
 * cualquier beneficio del programa que declaro tener es elegible por ahora.
 */
export async function rankBenefits(params: {
  userId: string;
  city: string;
  affinity: AffinityCategory;
}): Promise<Recommendation[]> {
  const { userId, city, affinity } = params;

  const programIds = await getUserProgramIds(userId);
  if (programIds.length === 0) return [];

  const { data: programRows, error: programsError } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", programIds);
  if (programsError) {
    throw new Error(`No se pudieron resolver los programas: ${programsError.message}`);
  }
  const programNameById = new Map(
    (programRows ?? []).map((p) => [p.id as string, p.name as string])
  );

  const { data: benefitRows, error: benefitsError } = await supabase
    .from("benefits")
    .select("id, title, category, city, source_program_id")
    .eq("status", "activo")
    .in("source_program_id", programIds);
  if (benefitsError) {
    throw new Error(`No se pudieron consultar los beneficios: ${benefitsError.message}`);
  }

  const exposedIds = new Set(await getExposedBenefitIds(userId));

  const candidates = ((benefitRows ?? []) as BenefitRow[])
    .filter((b) => !exposedIds.has(b.id))
    .filter((b) => cityMatches(b.city, city));

  // Si la afinidad exacta no da suficientes resultados, se completa con el
  // resto de candidatos elegibles (mismo criterio de ciudad + programa +
  // sin exponer antes), para no dejar al usuario con menos de 3 si hay mas
  // disponibles.
  const eligible = candidates.filter((b) => categoryMatchesAffinity(b.category, affinity));
  const fallbackPool = candidates.filter((b) => !eligible.includes(b));

  const top3 = [...eligible, ...fallbackPool].slice(0, 3);

  const recommendations: Recommendation[] = [];
  for (const row of top3) {
    const benefit: RankedBenefit = {
      id: row.id,
      title: row.title,
      sourceProgram: programNameById.get(row.source_program_id) ?? "",
    };
    const reason = await writeReason(benefit, affinity);
    recommendations.push({ benefit, reason });
  }
  return recommendations;
}

async function writeReason(
  benefit: RankedBenefit,
  affinity: AffinityCategory
): Promise<string> {
  const prompt = `Escribe UNA sola frase corta (maximo 15 palabras), en tono formal-cercano, en
español correcto, explicando por que este beneficio le puede interesar a alguien
interesado en "${affinity}". No uses lenguaje de venta. No uses emojis.

Beneficio: "${benefit.title}" (fuente: ${benefit.sourceProgram})`;

  return (await miaTask(prompt)).trim();
}
