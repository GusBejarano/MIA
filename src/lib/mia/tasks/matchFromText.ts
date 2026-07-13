import { miaTask } from "../claudeClient";

/**
 * Matchea texto libre contra una lista dinamica de opciones reales (nombres
 * de benefactores, categorias, etc.) - reemplaza la version vieja de
 * extractPrograms.ts que solo reconocia los 6 programas fijos. Tarea de
 * Haiku 4.5, mismo patron que el resto de clasificadores de back-office.
 */
export async function matchManyFromList(
  freeText: string,
  options: string[]
): Promise<string[]> {
  if (options.length === 0) return [];

  const prompt = `De esta lista: ${options.join(", ")}.

El usuario respondio: "${freeText}"

Devuelve SOLO los elementos exactos de la lista que el usuario mencione, uno
por linea, sin numeracion ni explicacion. Si no menciona ninguno, responde
"ninguno".`;

  const result = await miaTask(prompt);
  if (result.toLowerCase().includes("ninguno")) return [];

  const lines = result.split("\n").map((l) => l.trim());
  return options.filter((o) => lines.some((l) => l.toLowerCase() === o.toLowerCase()));
}

export async function matchOneFromList(
  freeText: string,
  options: string[]
): Promise<string | null> {
  const matches = await matchManyFromList(freeText, options);
  return matches[0] ?? null;
}
