import { miaTask } from "../claudeClient";

export type SuggestionCandidate = { id: string; title: string; category: string; conditions: string };

// Tope de caracteres de conditions por candidato en el prompt - mismo
// criterio que findBusinessInConditions.ts (suficiente contexto sin
// inflar el prompt con letra chica que no aporta a la relevancia).
const CONDITIONS_EXCERPT_LENGTH = 300;

// Tope duro de cuantos ids puede devolver esta funcion, independiente del
// reparto final (7 conectados + 5 externos, ver getSuggestions en
// discovery.ts) - esto es solo un filtro de relevancia semantica, nunca
// el criterio final de cuantos se muestran.
const MAX_RELEVANT_IDS = 20;

/**
 * Filtro de relevancia (Haiku) para el tab "Sugerencias" (dev 2.5) - a
 * diferencia de findBenefitIdsByConditionsMention (que busca un negocio
 * puntual por nombre), esta tarea interpreta una necesidad/ocasion libre
 * (ej. "quiero invitar a mi esposa a cenar hoy") contra TODO el catalogo
 * activo de la ciudad, sin importar el benefactor. Devuelve solo QUE
 * beneficios son relevantes - el orden final (estrellas propias, luego %
 * de descuento) y el reparto conectados/externos los decide
 * getSuggestions en discovery.ts, no esta tarea.
 *
 * Mismo patron de indices (no UUIDs) que findBenefitIdsByConditionsMention:
 * pedirle a un LLM que copie un UUID textualmente es fragil.
 */
export async function findRelevantSuggestionIds(
  need: string,
  candidates: SuggestionCandidate[]
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const listing = candidates
    .map(
      (c, i) =>
        `${i + 1}. Titulo: "${c.title}" | Categoria: "${c.category}" | Condiciones: "${c.conditions.slice(0, CONDITIONS_EXCERPT_LENGTH)}"`
    )
    .join("\n");

  const prompt = `Un usuario le escribio esto a MIA, un asistente de descuentos: "${need}"

Lista de beneficios activos disponibles (titulo + categoria + condiciones):

${listing}

Tu tarea: identificar cuales de estos beneficios responden de verdad a lo
que el usuario esta buscando (la ocasion, necesidad o tipo de negocio que
menciona) - el sentido real del pedido, no solo coincidencias de palabras
sueltas.

Devuelve SOLO los numeros de la lista que apliquen, del mas relevante al
menos relevante, uno por linea, sin numeracion adicional ni explicacion.
Maximo ${MAX_RELEVANT_IDS} numeros. Si ninguno aplica, responde "ninguno".`;

  const raw = await miaTask(prompt);
  if (raw.toLowerCase().includes("ninguno")) return [];

  const indices = raw
    .split("\n")
    .map((line) => parseInt(line.replace(/[^0-9]/g, ""), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= candidates.length);

  const unique = [...new Set(indices)].slice(0, MAX_RELEVANT_IDS);
  return unique.map((n) => candidates[n - 1].id);
}
