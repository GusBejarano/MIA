import { miaTask } from "../claudeClient";
import { AFFINITY_CATEGORIES, type AffinityCategory } from "../categoryMapping";

export type BenefitRequestDetection = {
  isRequest: boolean;
  /** Solo si el mensaje señala una categoria puntual distinta a la afinidad ya guardada. */
  affinity?: AffinityCategory;
};

/**
 * Clasifica si un mensaje de conversacion libre (post-onboarding) le esta
 * pidiendo a MIA beneficios/descuentos - de forma general ("que mas tienes")
 * o sobre una categoria especifica ("tienes algo de mascotas"). Tarea de
 * Haiku 4.5, igual que el resto de clasificadores de back-office.
 */
export async function detectBenefitRequest(
  message: string
): Promise<BenefitRequestDetection> {
  const prompt = `Analiza si el siguiente mensaje de un usuario le esta pidiendo a MIA (un
asistente de descuentos) que le muestre beneficios, descuentos u ofertas -
de forma general ("que mas tienes", "muestrame otras opciones") o sobre una
categoria especifica (ej. "tienes algo de mascotas", "y de gimnasios que hay").

No cuenta como pedido de beneficios: saludos, agradecimientos, preguntas sobre
como funciona MIA, o comentarios que no buscan una recomendacion nueva.

Categorias posibles si menciona una especifica: ${AFFINITY_CATEGORIES.join(", ")}.

Mensaje: "${message}"

Responde EXACTAMENTE en uno de estos 3 formatos, sin explicacion:
NO
SI:general
SI:<categoria exacta de la lista de arriba>`;

  const raw = (await miaTask(prompt)).trim().toLowerCase();

  if (!raw.startsWith("si")) return { isRequest: false };
  if (raw.startsWith("si:general")) return { isRequest: true };

  const requested = raw.split(":")[1]?.trim();
  const affinity = AFFINITY_CATEGORIES.find((c) => requested?.includes(c));
  return { isRequest: true, affinity };
}
