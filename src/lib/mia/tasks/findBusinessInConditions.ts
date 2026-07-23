import { miaTask } from "../claudeClient";

export type ConditionsCandidate = { id: string; title: string; conditions: string };

// Tope de caracteres de conditions por candidato en el prompt - suficiente
// para frases tipo "Aldea Asiatica" (nombres de negocio suelen aparecer al
// principio del texto), sin inflar el prompt con letra chica de horarios o
// metodos de pago que no aporta a la busqueda.
const CONDITIONS_EXCERPT_LENGTH = 400;

/**
 * Capa 2 del buscador de negocio: busqueda semantica (Haiku) dentro del
 * texto de `conditions` de beneficios activos, para el caso "paraguas" -
 * el titulo es una marca/agrupador (ej. "Aldea Asiatica") pero el negocio
 * real que el usuario escribio (ej. "Fusion Wok") solo aparece mencionado
 * en prosa dentro de las condiciones. Solo se llama cuando la Capa 1
 * (similitud de titulo, ver businessSearch.ts) no encontro nada.
 *
 * Devuelve indices (no UUIDs) desde el prompt y los mapea de vuelta -
 * pedirle a un LLM que copie un UUID textualmente es fragil (un caracter
 * mal copiado rompe el match exacto); un numero de lista es mucho mas
 * dificil de corromper.
 */
export async function findBenefitIdsByConditionsMention(
  businessQuery: string,
  candidates: ConditionsCandidate[]
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const listing = candidates
    .map(
      (c, i) =>
        `${i + 1}. Titulo: "${c.title}" | Condiciones: "${(c.conditions ?? "").slice(0, CONDITIONS_EXCERPT_LENGTH)}"`
    )
    .join("\n");

  const prompt = `Un usuario quiere saber si tiene descuento en el negocio/comercio: "${businessQuery}"

Lista de beneficios activos (titulo + texto de condiciones):

${listing}

Algunos titulos son marcas "paraguas" que agrupan varios negocios reales
distintos, mencionados solo dentro del texto de condiciones (ej. un titulo
"Aldea Asiatica" cuyas condiciones mencionan los restaurantes reales "Fusion
Wok, Uki, Baoku y Mo Sushi" - alguien que busque "Fusion Wok" deberia
encontrar ese beneficio aunque el titulo no lo mencione).

Tu tarea: encontrar en cuales de estos beneficios el texto de CONDICIONES
(no el titulo) menciona explicitamente un negocio que coincida con
"${businessQuery}".

Devuelve SOLO los numeros de la lista que apliquen, uno por linea, sin
numeracion adicional ni explicacion. Si ninguno aplica, responde "ninguno".`;

  const raw = await miaTask(prompt);
  if (raw.toLowerCase().includes("ninguno")) return [];

  const indices = raw
    .split("\n")
    .map((line) => parseInt(line.replace(/[^0-9]/g, ""), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= candidates.length);

  return [...new Set(indices)].map((n) => candidates[n - 1].id);
}
