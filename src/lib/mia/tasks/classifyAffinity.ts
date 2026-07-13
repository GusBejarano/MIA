import { miaTask } from "../claudeClient";
import { AFFINITY_CATEGORIES, type AffinityCategory } from "../categoryMapping";

export type { AffinityCategory };

/**
 * Clasifica la respuesta libre de la Pregunta 2 en uno de los baldes de
 * afinidad. Tarea de Haiku 4.5 segun la tabla de enrutamiento aprobada.
 */
export async function classifyAffinity(
  freeText: string
): Promise<AffinityCategory> {
  const prompt = `Clasifica la siguiente respuesta de un usuario en EXACTAMENTE una de estas categorias: ${AFFINITY_CATEGORIES.join(
    ", "
  )}.

Respuesta del usuario: "${freeText}"

Responde unicamente con el nombre de la categoria, en minusculas, sin explicacion.`;

  const result = (await miaTask(prompt)).trim().toLowerCase();
  const match = AFFINITY_CATEGORIES.find((c) => result.includes(c));
  return match ?? "entretenimiento"; // fallback razonable si Haiku responde algo inesperado
}
