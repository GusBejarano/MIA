import { miaTask } from "../claudeClient";

export type OpenMessageIntent =
  | { kind: "none" }
  | { kind: "benefactors" }
  | { kind: "benefactor"; label: string }
  | { kind: "category_menu" }
  | { kind: "category"; label: string }
  | { kind: "business_search"; businessName: string }
  | { kind: "suggestion"; need: string };

/**
 * Clasifica un mensaje de conversacion libre en una de 6 intenciones, para
 * que MIA muestre la seleccion correspondiente (un benefactor puntual,
 * benefactores en general, menu de categorias, el carrusel de una
 * categoria puntual, o la busqueda de un negocio puntual por nombre) en
 * vez de responder con texto - el texto solo se usa cuando el mensaje de
 * verdad no tiene que ver con nada de esto (charla, agradecimientos,
 * preguntas generales).
 * Tarea de Haiku 4.5, mismo patron que el resto de clasificadores.
 */
export async function classifyOpenMessage(
  message: string,
  options: { benefactorNames: string[]; categoryLabels: string[] }
): Promise<OpenMessageIntent> {
  const { benefactorNames, categoryLabels } = options;

  const prompt = `El usuario le escribio esto a MIA, un asistente de descuentos, en
conversacion libre: "${message}"

Clasifica la intencion en EXACTAMENTE una de estas opciones:

- BENEFACTOR:<nombre exacto de la lista de abajo>: quiere cambiar a, o ver
  que hay con, un benefactor especifico de esta lista: ${benefactorNames.join(", ") || "(ninguno todavia)"}
  (ej. "y en Comfandi que hay", "muestrame lo de Comfenalco", "cambia a
  Visa" -> BENEFACTOR:Comfandi).
- BENEFACTORES: quiere ver, cambiar o agregar los programas/benefactores que
  tiene, SIN nombrar uno especifico de la lista (ej. "que otros programas
  hay", "quiero cambiar mis programas", "cuales tengo disponibles").
- CATEGORIAS: quiere ver el menu de categorias disponibles, sin especificar
  cual (ej. "que mas tienes", "muestrame otras opciones", "que mas hay").
- CATEGORIA:<nombre exacto de la lista de abajo>: menciona una categoria
  especifica de esta lista: ${categoryLabels.join(", ") || "(ninguna disponible todavia)"}
  (ej. si dice "algo de mascotas" y "Mascotas" esta en la lista, responde
  CATEGORIA:Mascotas).
- BUSCAR_NEGOCIO:<nombre del negocio o comercio, tal cual lo escribio el
  usuario o levemente limpio>: el usuario pregunta si tiene descuento en un
  comercio/negocio especifico por su nombre propio, que NO coincide con
  ningun benefactor ni categoria de las listas de arriba (ej. "tienes
  descuento en Crepes & Waffles", "el gimnasio de la 5ta tiene algo?", "que
  hay de Sushi Green" -> BUSCAR_NEGOCIO:Sushi Green). Si el nombre que
  menciona SI coincide con un benefactor o categoria de las listas de
  arriba, usa esa clasificacion en vez de esta.
- SUGERENCIA:<resumen breve de 3-6 palabras de lo que busca>: pide una
  recomendacion para una necesidad u ocasion, SIN nombrar un negocio
  puntual por su nombre propio (eso es BUSCAR_NEGOCIO) y sin que la
  respuesta sea simplemente una categoria o benefactor exacto de las
  listas de arriba (ej. "quiero invitar a mi esposa a cenar hoy", "algo
  para hacer con mis hijos el finde", "donde hago ejercicio barato" ->
  SUGERENCIA:cena romantica hoy).
- NINGUNA: no tiene que ver con ver beneficios, categorias, benefactores,
  ciudades, negocios puntuales o sugerencias (saludo, agradecimiento,
  pregunta general sobre como funciona MIA, etc.) - tambien responde
  NINGUNA si el mensaje habla de cambiar de CIUDAD (eso se clasifica
  aparte, no es tu trabajo).

Responde EXACTAMENTE con una linea, uno de: NINGUNA / BENEFACTOR:<nombre> / BENEFACTORES / CATEGORIAS / CATEGORIA:<nombre> / BUSCAR_NEGOCIO:<nombre> / SUGERENCIA:<resumen>`;

  const raw = (await miaTask(prompt)).trim();
  const upper = raw.toUpperCase();

  if (upper.startsWith("BENEFACTOR:")) {
    const name = raw.slice(raw.indexOf(":") + 1).trim();
    const match = benefactorNames.find((b) => b.toLowerCase() === name.toLowerCase());
    return match ? { kind: "benefactor", label: match } : { kind: "none" };
  }
  if (upper.startsWith("BENEFACTORES")) return { kind: "benefactors" };
  if (upper.startsWith("CATEGORIAS")) return { kind: "category_menu" };

  if (upper.startsWith("CATEGORIA:")) {
    const name = raw.slice(raw.indexOf(":") + 1).trim();
    const match = categoryLabels.find((c) => c.toLowerCase() === name.toLowerCase());
    return match ? { kind: "category", label: match } : { kind: "none" };
  }

  if (upper.startsWith("BUSCAR_NEGOCIO:")) {
    const businessName = raw.slice(raw.indexOf(":") + 1).trim();
    return businessName ? { kind: "business_search", businessName } : { kind: "none" };
  }

  if (upper.startsWith("SUGERENCIA:")) {
    const need = raw.slice(raw.indexOf(":") + 1).trim();
    return need ? { kind: "suggestion", need } : { kind: "none" };
  }

  return { kind: "none" };
}
