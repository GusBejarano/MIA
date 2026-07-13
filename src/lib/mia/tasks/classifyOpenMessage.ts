import { miaTask } from "../claudeClient";

export type OpenMessageIntent =
  | { kind: "none" }
  | { kind: "benefactors" }
  | { kind: "category_menu" }
  | { kind: "category"; label: string }
  | { kind: "city"; cityName: string };

/**
 * Clasifica un mensaje de conversacion libre en una de 5 intenciones, para
 * que MIA muestre la seleccion correspondiente (benefactores, menu de
 * categorias, el carrusel de una categoria puntual, o el cambio a otra
 * ciudad) en vez de responder con texto - el texto solo se usa cuando el
 * mensaje de verdad no tiene que ver con nada de esto (charla,
 * agradecimientos, preguntas generales). Tarea de Haiku 4.5, mismo patron
 * que el resto de clasificadores.
 */
export async function classifyOpenMessage(
  message: string,
  options: { benefactorNames: string[]; categoryLabels: string[] }
): Promise<OpenMessageIntent> {
  const { benefactorNames, categoryLabels } = options;

  const prompt = `El usuario le escribio esto a MIA, un asistente de descuentos, en
conversacion libre: "${message}"

Clasifica la intencion en EXACTAMENTE una de estas opciones:

- BENEFACTORES: quiere ver, cambiar o agregar los programas/benefactores que
  tiene (ej. "tambien tengo Comfenalco", "que otros programas hay", "quiero
  cambiar mis programas").
- CATEGORIAS: quiere ver el menu de categorias disponibles, sin especificar
  cual (ej. "que mas tienes", "muestrame otras opciones", "que mas hay").
- CATEGORIA:<nombre exacto de la lista de abajo>: menciona una categoria
  especifica de esta lista: ${categoryLabels.join(", ") || "(ninguna disponible todavia)"}
  (ej. si dice "algo de mascotas" y "Mascotas" esta en la lista, responde
  CATEGORIA:Mascotas).
- CIUDAD:<nombre de la ciudad mencionada>: quiere ver beneficios en una
  ciudad distinta a la que tiene registrada ahora mismo (ej. "muestrame
  beneficios en Bogota", "y en Palmira que hay", "estoy en Jamundi ahora").
- NINGUNA: no tiene que ver con ver beneficios, categorias, programas o
  ciudades (saludo, agradecimiento, pregunta general sobre como funciona
  MIA, etc.)

Programas/benefactores conocidos: ${benefactorNames.join(", ") || "(ninguno todavia)"}.

Responde EXACTAMENTE con una linea, uno de: NINGUNA / BENEFACTORES / CATEGORIAS / CATEGORIA:<nombre> / CIUDAD:<nombre>`;

  const raw = (await miaTask(prompt)).trim();
  const upper = raw.toUpperCase();

  if (upper.startsWith("BENEFACTORES")) return { kind: "benefactors" };
  if (upper.startsWith("CATEGORIAS")) return { kind: "category_menu" };

  if (upper.startsWith("CATEGORIA:")) {
    const name = raw.slice(raw.indexOf(":") + 1).trim();
    const match = categoryLabels.find((c) => c.toLowerCase() === name.toLowerCase());
    return match ? { kind: "category", label: match } : { kind: "none" };
  }

  if (upper.startsWith("CIUDAD:")) {
    const cityName = raw.slice(raw.indexOf(":") + 1).trim();
    return cityName ? { kind: "city", cityName } : { kind: "none" };
  }

  return { kind: "none" };
}
