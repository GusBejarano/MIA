import { miaTask } from "../claudeClient";

/**
 * Detecta si un mensaje libre del usuario indica que esta en una ciudad
 * distinta a la registrada. Tarea de Haiku 4.5 - corre sobre cada mensaje de
 * un usuario que regresa, tiene que ser barata.
 */
export async function detectCityChange(
  message: string,
  currentCity: string
): Promise<{ changed: boolean; newCity?: string }> {
  const prompt = `La ciudad registrada actualmente para este usuario es "${currentCity}".

Mensaje del usuario: "${message}"

¿El mensaje indica que el usuario esta ahora en una ciudad distinta a "${currentCity}"?
Si NO lo indica, responde exactamente: NO_CAMBIO
Si SI lo indica, responde exactamente: CAMBIO: <nombre de la ciudad nueva>`;

  const result = (await miaTask(prompt)).trim();

  if (result.startsWith("CAMBIO:")) {
    const newCity = result.replace("CAMBIO:", "").trim();
    if (newCity) return { changed: true, newCity };
  }
  return { changed: false };
}
