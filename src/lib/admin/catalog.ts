import { supabase } from "@/lib/mia/supabaseClient";

export type AdminCityOption = { value: string; label: string };
export type AdminProgramOption = { id: string; name: string };

/**
 * Todas las ciudades conocidas (city_regions), sin restringir a las que ya
 * tienen cobertura "activo" - a diferencia de getAvailableCities() (uso
 * publico), el admin necesita poder revisar/completar una ciudad aunque hoy
 * solo tenga beneficios en pendiente_revision (ej. los 19 de Coomeva
 * degradados en la Fase 4 de v2.0).
 */
export async function listAllCities(): Promise<AdminCityOption[]> {
  const { data, error } = await supabase
    .from("city_regions")
    .select("city, display_name")
    .order("display_name");
  if (error) throw new Error(`No se pudieron consultar las ciudades: ${error.message}`);
  return (data ?? []).map((r) => ({ value: r.city as string, label: r.display_name as string }));
}

/** Todos los benefactores (programs), sin restringir por cobertura - ver listAllCities. */
export async function listAllPrograms(): Promise<AdminProgramOption[]> {
  const { data, error } = await supabase.from("programs").select("id, name").order("name");
  if (error) throw new Error(`No se pudieron consultar los benefactores: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }));
}

export type AdminBenefitCard = {
  id: string;
  title: string;
  category: string | null;
  status: "pendiente_revision" | "activo" | "inactivo";
  imageUrl: string | null;
};

/**
 * Todos los beneficios de un benefactor en una ciudad, sin filtrar por
 * status (a diferencia de getBenefitsForCategory, de uso publico) - el
 * admin necesita ver activo/pendiente_revision/inactivo por igual. Reusa
 * resolve_city_scope (misma RPC que ya usa discovery.ts) para el alcance
 * ciudad+departamento+pais.
 */
export async function listBenefitsForAdmin(
  programId: string,
  city: string
): Promise<AdminBenefitCard[]> {
  const { data: scopeKeys, error: scopeError } = await supabase.rpc("resolve_city_scope", {
    target_city: city,
  });
  if (scopeError) {
    throw new Error(`No se pudo resolver el alcance de la ciudad: ${scopeError.message}`);
  }

  const { data, error } = await supabase
    .from("benefits")
    .select("id, title, category, status, image_url")
    .eq("source_program_id", programId)
    .overlaps("city_list", (scopeKeys ?? []) as string[])
    .order("title");
  if (error) throw new Error(`No se pudieron consultar los beneficios: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    category: (r.category as string) ?? null,
    status: r.status as AdminBenefitCard["status"],
    imageUrl: (r.image_url as string) ?? null,
  }));
}

// Todos los campos editables de benefits - deliberadamente excluye
// id/created_at/source_program_id (no se reasignan desde este formulario) y
// city_list/category_list (columnas generadas, de solo lectura).
export type AdminBenefitFull = {
  id: string;
  title: string;
  category: string | null;
  city: string | null;
  status: "pendiente_revision" | "activo" | "inactivo";
  delivery_mode: "online" | "presencial" | "online_y_presencial" | null;
  coverage_confidence: "confirmada" | "estimada" | "desconocida" | null;
  conditions: string | null;
  access_type: string | null;
  redemption_instructions: string | null;
  valid_from: string | null;
  valid_until: string | null;
  image_url: string | null;
  company_url: string | null;
  social_media_url: string | null;
  how_to_get_there: string | null;
  address: string | null;
  hours: string | null;
  research_source: string | null;
  raw_data: unknown;
  updated_at: string;
};

const FULL_COLUMNS =
  "id, title, category, city, status, delivery_mode, coverage_confidence, conditions, " +
  "access_type, redemption_instructions, valid_from, valid_until, image_url, company_url, " +
  "social_media_url, how_to_get_there, address, hours, research_source, raw_data, updated_at";

export async function getBenefitFull(id: string): Promise<AdminBenefitFull | null> {
  const { data, error } = await supabase
    .from("benefits")
    .select(FULL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo consultar el beneficio: ${error.message}`);
  return (data as unknown as AdminBenefitFull) ?? null;
}

export type AdminBenefitPatch = Partial<Omit<AdminBenefitFull, "id" | "updated_at">>;

/**
 * Guarda los campos editados. Nunca lanza si el gate de cobertura de v2.0
 * (trigger check_benefit_city_coverage) degrada el status a
 * pendiente_revision - eso es un comportamiento esperado, no un error; el
 * llamador debe comparar el status devuelto contra lo que el usuario eligio
 * para avisarle. benefits.updated_at no se actualiza solo (no hay trigger
 * para eso, confirmado) - se setea aqui explicitamente.
 */
export async function updateBenefitAdmin(
  id: string,
  patch: AdminBenefitPatch
): Promise<AdminBenefitFull> {
  const { data, error } = await supabase
    .from("benefits")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(FULL_COLUMNS)
    .single();
  if (error) throw new Error(`No se pudo guardar el beneficio: ${error.message}`);
  return data as unknown as AdminBenefitFull;
}
