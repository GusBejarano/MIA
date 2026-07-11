import { MOCK_BENEFITS, type Benefit } from "../mockBenefits.js";
import type { AffinityCategory } from "./classifyAffinity.js";
import { miaTask } from "../claudeClient.js";

export type Recommendation = {
  benefit: Benefit;
  reason: string;
};

/**
 * Ranking de las 3 mejores recomendaciones. La seleccion es mecanica (afinidad +
 * acceso + ciudad, sin modelo de lenguaje), tal como quedo documentado: "la
 * mayoria de los rankings son mecanicos". Solo se llama a Haiku para redactar la
 * razon especifica de cada recomendacion, que si necesita lenguaje natural.
 *
 * Regla de negocio ya aprobada: nunca mas de 3, nunca menos si hay disponibles.
 */
export async function rankBenefits(params: {
  city: string;
  affinity: AffinityCategory;
  programs: string[];
}): Promise<Recommendation[]> {
  const { city, affinity, programs } = params;

  const eligible = MOCK_BENEFITS.filter((b) => {
    const cityMatches = b.city.toLowerCase() === city.toLowerCase();
    const categoryMatches = b.category === affinity;
    const accessMatches =
      b.accessType === "publico" ||
      programs.some(
        (p) => p.toLowerCase() === b.sourceProgram.toLowerCase()
      );
    return cityMatches && categoryMatches && accessMatches;
  });

  // Si la afinidad exacta no da suficientes resultados, se completa con el resto
  // de beneficios elegibles por ciudad + acceso (mismo criterio de acceso, sin
  // filtrar por categoria), para no dejar al usuario con menos de 3 si hay mas
  // disponibles - regla ya aprobada ("nunca menos si hay disponibles").
  const fallbackPool = MOCK_BENEFITS.filter((b) => {
    const cityMatches = b.city.toLowerCase() === city.toLowerCase();
    const accessMatches =
      b.accessType === "publico" ||
      programs.some(
        (p) => p.toLowerCase() === b.sourceProgram.toLowerCase()
      );
    return cityMatches && accessMatches && !eligible.includes(b);
  });

  const top3 = [...eligible, ...fallbackPool].slice(0, 3);

  const recommendations: Recommendation[] = [];
  for (const benefit of top3) {
    const reason = await writeReason(benefit, affinity);
    recommendations.push({ benefit, reason });
  }
  return recommendations;
}

async function writeReason(
  benefit: Benefit,
  affinity: AffinityCategory
): Promise<string> {
  const prompt = `Escribe UNA sola frase corta (maximo 15 palabras), en tono formal-cercano, en
español correcto, explicando por que este beneficio le puede interesar a alguien
interesado en "${affinity}". No uses lenguaje de venta. No uses emojis.

Beneficio: "${benefit.title}" (fuente: ${benefit.sourceProgram})`;

  return (await miaTask(prompt)).trim();
}
