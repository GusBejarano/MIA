import { miaTask } from "../claudeClient";

const CATEGORIES = ["comida", "viajes", "entretenimiento", "salud"] as const;
export type AffinityCategory = (typeof CATEGORIES)[number];

/**
 * Clasifica la respuesta libre de la Pregunta 2 en una de las 4 categorias de
 * afinidad. Tarea de Haiku 4.5 segun la tabla de enrutamiento aprobada.
 */
export async function classifyAffinity(
  freeText: string
): Promise<AffinityCategory> {
  const prompt = `Clasifica la siguiente respuesta de un usuario en EXACTAMENTE una de estas categorias: ${CATEGORIES.join(
    ", "
  )}.

Respuesta del usuario: "${freeText}"

Responde unicamente con el nombre de la categoria, en minusculas, sin explicacion.`;

  const result = (await miaTask(prompt)).trim().toLowerCase();
  const match = CATEGORIES.find((c) => result.includes(c));
  return match ?? "entretenimiento"; // fallback razonable si Haiku responde algo inesperado
}
