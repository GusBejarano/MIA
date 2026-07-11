import { miaTask } from "../claudeClient";

const KNOWN_PROGRAMS = [
  "Comfandi",
  "Comfenalco",
  "Visa",
  "Mastercard",
  "Puntos Colombia",
  "PriceSmart",
] as const;

/**
 * Extrae que programas de los 6 conocidos menciono el usuario en la Pregunta 3.
 * Tarea de Haiku 4.5 - extraccion estructurada sobre texto libre.
 */
export async function extractPrograms(freeText: string): Promise<string[]> {
  const prompt = `De esta lista de programas: ${KNOWN_PROGRAMS.join(", ")}.

El usuario respondio: "${freeText}"

Devuelve SOLO los nombres exactos de la lista que el usuario mencione, uno por
linea, sin numeracion ni explicacion. Si no menciona ninguno, responde "ninguno".`;

  const result = await miaTask(prompt);
  if (result.toLowerCase().includes("ninguno")) return [];

  return result
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      KNOWN_PROGRAMS.some((p) => p.toLowerCase() === line.toLowerCase())
    );
}
