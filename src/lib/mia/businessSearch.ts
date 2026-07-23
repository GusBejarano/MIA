import { supabase } from "./supabaseClient";
import { findBenefitIdsByConditionsMention } from "./tasks/findBusinessInConditions";

export type BusinessSearchMatch = {
  id: string;
  title: string;
  city: string;
  sourceProgramId: string;
  imageUrl: string | null;
};

// Punto de partida calibrado a mano contra casos reales del catalogo
// (Bodytech, Sushi Green, "Motos Honda" -> "Motos Honda (5%)") - ver
// README.md para el detalle de las pruebas. Vive aca (no en Supabase)
// porque a diferencia del umbral de recordatorio (app_settings), este no
// necesita cambiar sin deploy: es un parametro tecnico del matcher, no
// una decision de producto.
const TITLE_SIMILARITY_THRESHOLD = 0.35;
const TITLE_SIMILARITY_LIMIT = 10;

/** Capa 1 — determinística, sin IA: similitud de trigramas (pg_trgm) contra benefits.title, via la funcion RPC de supabase/2026.07.22-mia_business_search_similarity_fn.sql. */
async function searchByTitleSimilarity(query: string): Promise<BusinessSearchMatch[]> {
  const { data, error } = await supabase.rpc("search_benefits_by_title_similarity", {
    search_text: query,
    min_similarity: TITLE_SIMILARITY_THRESHOLD,
    match_limit: TITLE_SIMILARITY_LIMIT,
  });
  if (error) {
    throw new Error(`No se pudo buscar por similitud de titulo: ${error.message}`);
  }
  type SimilarityRow = {
    id: string;
    title: string;
    source_program_id: string;
    city: string;
    similarity_score: number;
  };
  return ((data ?? []) as SimilarityRow[]).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    city: row.city as string,
    sourceProgramId: row.source_program_id as string,
    // La funcion RPC no trae image_url (no aporta a la similitud) - el
    // caso de un solo resultado va directo al detalle (que si trae foto
    // real); el caso multiple es el unico que pierde thumbnail para
    // beneficios encontrados por esta capa.
    imageUrl: null,
  }));
}

/** Capa 2 — semantica (Haiku), solo si la Capa 1 no encontro nada: cubre el caso "paraguas" (negocio mencionado en `conditions`, no en `title`). */
async function searchByConditionsMention(query: string): Promise<BusinessSearchMatch[]> {
  const { data, error } = await supabase
    .from("benefits")
    .select("id, title, conditions, city, source_program_id, image_url")
    .eq("status", "activo");
  if (error) {
    throw new Error(`No se pudieron consultar los beneficios activos: ${error.message}`);
  }

  const rows = data ?? [];
  const matchedIds = await findBenefitIdsByConditionsMention(
    query,
    rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      conditions: (r.conditions as string) ?? "",
    }))
  );

  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return matchedIds.map((id) => {
    const row = byId.get(id)!;
    return {
      id,
      title: row.title as string,
      city: row.city as string,
      sourceProgramId: row.source_program_id as string,
      imageUrl: (row.image_url as string) ?? null,
    };
  });
}

/**
 * Busqueda de negocio por texto libre, en 2 capas: determinística primero
 * (rapida, barata, sin IA), semantica solo si la primera no encuentra
 * nada. Devuelve coincidencias de TODAS las ciudades - el filtrado por
 * ciudad del usuario (para decidir detalle directo / carrusel / fuera de
 * ciudad / no encontrado) es responsabilidad de quien llama (ver
 * OnboardingSession.resolveBusinessSearch), no de esta funcion.
 */
export async function findBusinessMatches(query: string): Promise<BusinessSearchMatch[]> {
  const layer1 = await searchByTitleSimilarity(query);
  if (layer1.length > 0) return layer1;
  return searchByConditionsMention(query);
}

export { TITLE_SIMILARITY_THRESHOLD };
