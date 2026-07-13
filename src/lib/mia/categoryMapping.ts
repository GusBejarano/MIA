// Mapeo entre los baldes de afinidad de MIA (usados por rankBenefits.ts y
// detectBenefitRequest.ts) y las categorias reales que vienen cargadas en
// benefits.category (texto libre, a veces compuesto por varias separadas
// con coma, ej. "Educacion, Entretenimiento").
//
// Cada balde puede matchear una o mas categorias reales - se revisa y amplia
// a mano cada vez que se carga un Benefactor nuevo con categorias distintas.
// Los valores de la derecha deben ir en minusculas (la comparacion normaliza
// ambos lados a minusculas).

export const AFFINITY_CATEGORIES = [
  "gastronomia",
  "viajes",
  "entretenimiento",
  "salud",
  "moda",
  "autos y motos",
  "mascotas",
  "educacion",
  "hogar y construccion",
] as const;

export type AffinityCategory = (typeof AFFINITY_CATEGORIES)[number];

export const CATEGORY_MATCHES: Record<AffinityCategory, string[]> = {
  gastronomia: ["gastronomia"],
  viajes: ["hoteles y turismo"],
  entretenimiento: ["entretenimiento"],
  salud: ["salud y belleza", "acondicionamiento fisico"],
  moda: ["moda"],
  "autos y motos": ["autos y motos"],
  mascotas: ["mascotas"],
  educacion: ["educacion"],
  "hogar y construccion": ["hogar y construccion"],
};

/**
 * `dbCategory` puede venir compuesta ("Educacion, Entretenimiento") - hace
 * match si CUALQUIERA de sus pedazos coincide con las categorias reales
 * asociadas al balde de afinidad dado.
 */
export function categoryMatchesAffinity(
  dbCategory: string,
  affinity: AffinityCategory
): boolean {
  const pieces = dbCategory
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const targets = CATEGORY_MATCHES[affinity];
  return pieces.some((p) => targets.includes(p));
}

/**
 * Lookup inverso: dada una categoria real (ya normalizada a minusculas, tal
 * como la elige el usuario en el flujo de chips), devuelve el balde de
 * afinidad al que pertenece - si hay alguno mapeado. Se usa para que
 * freeChat sepa por que categoria seguir buscando despues de que el usuario
 * eligio via chips, sin haber pasado por classifyAffinity.
 */
export function affinityForRealCategory(realCategory: string): AffinityCategory | undefined {
  const key = realCategory.trim().toLowerCase();
  return AFFINITY_CATEGORIES.find((a) => CATEGORY_MATCHES[a].includes(key));
}
