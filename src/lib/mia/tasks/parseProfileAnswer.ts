import { miaTask } from "../claudeClient";

export type GenderValue = "femenino" | "masculino" | "otro" | "prefiero_no_decir";
const GENDER_VALUES: readonly GenderValue[] = [
  "femenino",
  "masculino",
  "otro",
  "prefiero_no_decir",
];

export type ProfileFieldKey = "name" | "gender" | "birth_date";

// Tope de sanidad, no un limite real de la columna (users.name es texto
// libre sin CHECK de longitud) - solo para descartar que alguien pegue un
// parrafo entero como "nombre".
const MAX_NAME_LENGTH = 60;

function parseNameAnswer(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

/**
 * Clasifica la respuesta libre del usuario en uno de los 4 valores que
 * acepta el CHECK de `users.gender` - interpreta sinonimos/coloquialismos
 * (Haiku), no exige que el usuario escriba el valor exacto.
 */
async function parseGenderAnswer(message: string): Promise<GenderValue | null> {
  const prompt = `Un usuario respondio esto a la pregunta "¿Cómo prefieres que me dirija a ti?": "${message}"

Clasifica su respuesta en EXACTAMENTE una de estas 4 opciones (interpretando
sinonimos y formas coloquiales - ej. "hombre"/"soy un chico" -> masculino,
"mujer"/"chica" -> femenino, "no binario"/"nb" -> otro):
- femenino
- masculino
- otro
- prefiero_no_decir

Si la respuesta no tiene nada que ver con genero y no se puede clasificar con
confianza razonable, responde exactamente "ninguna".

Responde con EXACTAMENTE una palabra: femenino / masculino / otro / prefiero_no_decir / ninguna`;

  const raw = (await miaTask(prompt)).trim().toLowerCase();
  return (GENDER_VALUES as readonly string[]).includes(raw) ? (raw as GenderValue) : null;
}

const MIN_BIRTH_YEAR_OFFSET_DAYS = 120 * 365; // tope de sanidad, no exacto (anos bisiestos) - de sobra para descartar fechas absurdas

/**
 * Extrae una fecha de nacimiento de texto libre (cualquier formato) y la
 * normaliza a ISO (YYYY-MM-DD) - null si el mensaje no trae una fecha
 * identificable, o si la fecha no es una fecha de nacimiento razonable
 * (futura, o de hace mas de ~120 anos).
 */
async function parseBirthDateAnswer(message: string): Promise<string | null> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const prompt = `Hoy es ${todayIso}. Un usuario respondio esto a la pregunta por su fecha de
nacimiento: "${message}"

Si el mensaje contiene una fecha de nacimiento identificable (en cualquier
formato, ej. "15 de marzo de 1990", "15/03/1990", "1990-03-15"), conviertela
a formato ISO YYYY-MM-DD.

Si el mensaje NO trae una fecha de nacimiento identificable, responde
exactamente "ninguna".

Responde con EXACTAMENTE una linea: la fecha en YYYY-MM-DD, o "ninguna".`;

  const raw = (await miaTask(prompt)).trim();
  if (raw.toLowerCase() === "ninguna") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() > Date.now()) return null;
  const daysAgo = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo > MIN_BIRTH_YEAR_OFFSET_DAYS) return null;

  return raw;
}

/** Interpreta la respuesta libre del usuario a un campo de perfil pendiente - null si no trae un valor usable (decline implicito). */
export async function parseProfileAnswer(
  fieldKey: ProfileFieldKey,
  message: string
): Promise<string | null> {
  switch (fieldKey) {
    case "name":
      return parseNameAnswer(message);
    case "gender":
      return parseGenderAnswer(message);
    case "birth_date":
      return parseBirthDateAnswer(message);
  }
}
