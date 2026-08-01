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

export type SiteBucket = "mono-sede" | "1-5 sedes" | "6-10 sedes" | "+10 sedes" | "sin clasificar";

/**
 * Estimado (no un conteo real todavia - benefit_locations recien se esta
 * poblando) a partir del mismo tipo de señal de texto ya usada en la
 * limpieza del comodin "Colombia" de v2.0: numero explicito ("+10 puntos",
 * "134 puntos en 33 ciudades"): usa el numero; una direccion de calle unica
 * sin mencion de mas sedes: mono-sede; "Varias Tiendas"/similar sin numero,
 * o sin dato: sin clasificar. Se reemplaza solo cuando haya sedes reales
 * cargadas en benefit_locations - hasta entonces, sirve para priorizar que
 * revisar primero (mono-sede primero, por ser el de mayor riesgo/mas barato
 * de verificar).
 */
export function estimateSiteBucket(address: string | null): SiteBucket {
  if (!address) return "sin clasificar";
  const text = address.toLowerCase();

  const numMatch = text.match(/(\d+)\s*(puntos?|tiendas?|sedes?|locales|ciudades)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n <= 1) return "mono-sede";
    if (n <= 5) return "1-5 sedes";
    if (n <= 10) return "6-10 sedes";
    return "+10 sedes";
  }

  if (/varias tiendas|multiples?\s+(sedes|puntos|locales|tiendas)|a nivel nacional/.test(text)) {
    return "sin clasificar";
  }

  // Direccion de calle concreta (Calle/Carrera/Avenida/Cra/Cll/Diagonal/
  // Transversal + numero) sin mencion de mas sedes - una sola direccion real.
  if (/(calle|carrera|avenida|cra\.?|cll\.?|diagonal|transversal|dg\.?|tv\.?)\s*\d/.test(text)) {
    return "mono-sede";
  }

  return "sin clasificar";
}

export type AdminBenefitCard = {
  id: string;
  title: string;
  category: string | null;
  status: "pendiente_revision" | "activo" | "inactivo";
  imageUrl: string | null;
  siteBucket: SiteBucket;
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
    .select("id, title, category, status, image_url, address, merchant_id")
    .eq("source_program_id", programId)
    .overlaps("city_list", (scopeKeys ?? []) as string[])
    .order("title");
  if (error) throw new Error(`No se pudieron consultar los beneficios: ${error.message}`);

  // Conteo real de sedes (Admin v2.0, comercio compartido) para los
  // beneficios ya migrados (merchant_id) - reemplaza la heuristica de texto
  // de estimateSiteBucket solo para esos, acotado a la misma ciudad que el
  // resto del listado (mismo patron benefit_location_links + overlaps de
  // city_list que listMerchantLocations/getBenefitLocations).
  const benefitIds = (data ?? []).map((r) => r.id as string);
  const { data: linkRows, error: linkError } = await supabase
    .from("benefit_location_links")
    .select("benefit_id, benefit_locations!inner(city_list)")
    .in("benefit_id", benefitIds)
    .overlaps("benefit_locations.city_list", (scopeKeys ?? []) as string[]);
  if (linkError) throw new Error(`No se pudieron contar las sedes reales: ${linkError.message}`);
  const realCountByBenefit = new Map<string, number>();
  for (const row of linkRows ?? []) {
    const id = row.benefit_id as string;
    realCountByBenefit.set(id, (realCountByBenefit.get(id) ?? 0) + 1);
  }

  return (data ?? []).map((r) => {
    const id = r.id as string;
    const siteBucket = r.merchant_id
      ? bucketFromLocationCount(realCountByBenefit.get(id) ?? 0)
      : estimateSiteBucket((r.address as string) ?? null);
    return {
      id,
      title: r.title as string,
      category: (r.category as string) ?? null,
      status: r.status as AdminBenefitCard["status"],
      imageUrl: (r.image_url as string) ?? null,
      siteBucket,
    };
  });
}

function bucketFromLocationCount(n: number): SiteBucket {
  if (n === 0) return "sin clasificar";
  if (n === 1) return "mono-sede";
  if (n <= 5) return "1-5 sedes";
  if (n <= 10) return "6-10 sedes";
  return "+10 sedes";
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
  /** Link a la fuente original de este beneficio - solo uso interno del panel admin, nunca visible en la app publica. */
  original_source_url: string | null;
  /** Comercio fisico vinculado (Admin v2.0, comercio compartido entre benefactores) - null = todavia no migrado, la pestaña Sedes lo trata como el flujo principal (buscador/vinculacion), no como caso raro. */
  merchant_id: string | null;
  raw_data: unknown;
  updated_at: string;
};

const FULL_COLUMNS =
  "id, title, category, city, status, delivery_mode, coverage_confidence, conditions, " +
  "access_type, redemption_instructions, valid_from, valid_until, image_url, company_url, " +
  "social_media_url, how_to_get_there, address, hours, research_source, original_source_url, " +
  "merchant_id, raw_data, updated_at";

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

// ============================================================
// Admin v2.0 - comercio compartido + sedes (pestaña "Sedes" del panel de edicion)
// ============================================================

/** Extrae lat/lng de un link largo de Google Maps (patron "@lat,lng,zoom") -
 * parseo simple de URL, no geocodificacion paga (decision ya tomada en
 * v2.0). Links cortos (maps.app.goo.gl) o de busqueda por texto no traen
 * coordenadas - devuelve null en ese caso, se completan a mano despues. */
export function extractLatLngFromMapsUrl(url: string): { lat: number | null; lng: number | null } {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return { lat: null, lng: null };
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

/** Links cortos (maps.app.goo.gl) no traen coordenadas en el texto - no
 * requiere geocodificacion paga, solo seguir la redireccion HTTP (gratis)
 * hasta la URL larga real, y aplicarle el mismo regex de siempre. Corre en
 * el servidor (Server Action) porque un fetch desde el navegador a un
 * dominio externo chocaria con CORS. */
export async function resolveMapsUrlLatLng(
  url: string
): Promise<{ lat: number | null; lng: number | null }> {
  const direct = extractLatLngFromMapsUrl(url);
  if (direct.lat !== null && direct.lng !== null) return direct;

  try {
    const response = await fetch(url, { redirect: "follow" });
    return extractLatLngFromMapsUrl(response.url);
  } catch {
    return { lat: null, lng: null };
  }
}

export type MerchantSearchResult = {
  id: string;
  name: string;
  locationCount: number;
  benefactors: string[];
};

/** Buscador de comercio (regla D.9) - nunca auto-vincula, solo propone
 * coincidencias con cuantas sedes tienen y de que otros benefactores vienen. */
export async function searchMerchants(query: string): Promise<MerchantSearchResult[]> {
  if (!query.trim()) return [];
  const { data: merchants, error } = await supabase
    .from("merchants")
    .select("id, name")
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(10);
  if (error) throw new Error(`No se pudieron buscar comercios: ${error.message}`);
  if (!merchants || merchants.length === 0) return [];

  const merchantIds = merchants.map((m) => m.id as string);

  const { data: locRows, error: locError } = await supabase
    .from("benefit_locations")
    .select("merchant_id")
    .in("merchant_id", merchantIds);
  if (locError) throw new Error(`No se pudieron contar sedes: ${locError.message}`);
  const countByMerchant = new Map<string, number>();
  for (const row of locRows ?? []) {
    const id = row.merchant_id as string;
    countByMerchant.set(id, (countByMerchant.get(id) ?? 0) + 1);
  }

  const { data: benefitRows, error: benefitError } = await supabase
    .from("benefits")
    .select("merchant_id, source_program_id")
    .in("merchant_id", merchantIds);
  if (benefitError) throw new Error(`No se pudieron consultar benefactores: ${benefitError.message}`);
  const programIds = [...new Set((benefitRows ?? []).map((r) => r.source_program_id as string))];
  const { data: programRows } = await supabase.from("programs").select("id, name").in("id", programIds);
  const programNameById = new Map((programRows ?? []).map((p) => [p.id as string, p.name as string]));
  const benefactorsByMerchant = new Map<string, Set<string>>();
  for (const row of benefitRows ?? []) {
    const mId = row.merchant_id as string;
    const pName = programNameById.get(row.source_program_id as string) ?? "";
    if (!benefactorsByMerchant.has(mId)) benefactorsByMerchant.set(mId, new Set());
    if (pName) benefactorsByMerchant.get(mId)!.add(pName);
  }

  return merchants.map((m) => ({
    id: m.id as string,
    name: m.name as string,
    locationCount: countByMerchant.get(m.id as string) ?? 0,
    benefactors: [...(benefactorsByMerchant.get(m.id as string) ?? [])],
  }));
}

export async function createMerchantAndLink(benefitId: string, name: string): Promise<string> {
  const { data: merchant, error } = await supabase
    .from("merchants")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear el comercio: ${error.message}`);
  const merchantId = merchant.id as string;
  const { error: updateError } = await supabase
    .from("benefits")
    .update({ merchant_id: merchantId })
    .eq("id", benefitId);
  if (updateError) throw new Error(`No se pudo vincular el comercio: ${updateError.message}`);
  return merchantId;
}

export async function linkExistingMerchant(benefitId: string, merchantId: string): Promise<void> {
  const { error } = await supabase
    .from("benefits")
    .update({ merchant_id: merchantId })
    .eq("id", benefitId);
  if (error) throw new Error(`No se pudo vincular el comercio: ${error.message}`);
}

/** Migracion asistida (regla D.10): usa benefits.address/how_to_get_there
 * (legacy) como primera sede propuesta - crea el comercio si hace falta,
 * la sede, y el vinculo, todo en un solo paso que el admin confirmo antes. */
export async function createSedeFromLegacy(benefitId: string): Promise<void> {
  const { data: benefit, error } = await supabase
    .from("benefits")
    .select("title, address, how_to_get_there, city, merchant_id")
    .eq("id", benefitId)
    .single();
  if (error || !benefit) throw new Error(`No se pudo consultar el beneficio: ${error?.message}`);
  if (!benefit.address || !benefit.how_to_get_there) {
    throw new Error("Este beneficio no tiene dirección/link de Maps legacy para usar como sede.");
  }

  const merchantId =
    (benefit.merchant_id as string | null) ??
    (await createMerchantAndLink(benefitId, benefit.title as string));

  const { lat, lng } = extractLatLngFromMapsUrl(benefit.how_to_get_there as string);
  const { data: location, error: locError } = await supabase
    .from("benefit_locations")
    .insert({
      merchant_id: merchantId,
      address: benefit.address,
      city: (benefit.city as string)?.split(",")[0]?.trim() ?? null,
      maps_url: benefit.how_to_get_there,
      lat,
      lng,
      source_confidence: "confirmada",
    })
    .select("id")
    .single();
  if (locError) throw new Error(`No se pudo crear la sede: ${locError.message}`);

  const { error: linkError } = await supabase
    .from("benefit_location_links")
    .insert({ benefit_id: benefitId, location_id: location.id });
  if (linkError) throw new Error(`No se pudo vincular la sede: ${linkError.message}`);
}

export type MerchantLocation = {
  id: string;
  name: string | null;
  address: string;
  city: string | null;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  linked: boolean;
};

/** Sedes del comercio acotadas a la ciudad ya elegida en la navegacion
 * (regla D.11) - mismo patron resolve_city_scope + .overlaps() que el
 * resto de la app, marcando cuales ya estan vinculadas a ESTE beneficio. */
export async function listMerchantLocations(
  merchantId: string,
  city: string,
  benefitId: string
): Promise<MerchantLocation[]> {
  const { data: scopeKeys, error: scopeError } = await supabase.rpc("resolve_city_scope", {
    target_city: city,
  });
  if (scopeError) {
    throw new Error(`No se pudo resolver el alcance de la ciudad: ${scopeError.message}`);
  }

  const { data: locations, error } = await supabase
    .from("benefit_locations")
    .select("id, name, address, city, maps_url, lat, lng")
    .eq("merchant_id", merchantId)
    .overlaps("city_list", (scopeKeys ?? []) as string[]);
  if (error) throw new Error(`No se pudieron consultar las sedes: ${error.message}`);

  const { data: links, error: linksError } = await supabase
    .from("benefit_location_links")
    .select("location_id")
    .eq("benefit_id", benefitId);
  if (linksError) throw new Error(`No se pudieron consultar los vínculos: ${linksError.message}`);
  const linkedIds = new Set((links ?? []).map((l) => l.location_id as string));

  return (locations ?? []).map((l) => ({
    id: l.id as string,
    name: (l.name as string) ?? null,
    address: l.address as string,
    city: (l.city as string) ?? null,
    mapsUrl: l.maps_url as string,
    lat: (l.lat as number) ?? null,
    lng: (l.lng as number) ?? null,
    linked: linkedIds.has(l.id as string),
  }));
}

export async function toggleLocationLink(
  benefitId: string,
  locationId: string,
  linked: boolean
): Promise<void> {
  if (linked) {
    const { error } = await supabase
      .from("benefit_location_links")
      .insert({ benefit_id: benefitId, location_id: locationId });
    if (error) throw new Error(`No se pudo vincular la sede: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("benefit_location_links")
      .delete()
      .eq("benefit_id", benefitId)
      .eq("location_id", locationId);
    if (error) throw new Error(`No se pudo desvincular la sede: ${error.message}`);
  }
}

export type LocationInput = {
  id?: string;
  merchantId: string;
  name: string | null;
  address: string;
  city: string | null;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
};

/** Crea o edita una sede (mismo formulario para ambos casos, regla D.12) -
 * al crear, no la vincula sola a ningun beneficio - eso lo hace
 * toggleLocationLink por separado (el llamador la marca vinculada tras crearla). */
export async function upsertLocation(input: LocationInput): Promise<string> {
  const payload = {
    merchant_id: input.merchantId,
    name: input.name,
    address: input.address,
    city: input.city,
    maps_url: input.mapsUrl,
    lat: input.lat,
    lng: input.lng,
  };
  if (input.id) {
    const { error } = await supabase.from("benefit_locations").update(payload).eq("id", input.id);
    if (error) throw new Error(`No se pudo guardar la sede: ${error.message}`);
    return input.id;
  }
  const { data, error } = await supabase
    .from("benefit_locations")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear la sede: ${error.message}`);
  return data.id as string;
}

/** Borra la sede y sus vinculos (benefit_location_links no tiene ON DELETE
 * CASCADE a proposito - se borra explicito aqui, en vez de dejar que la
 * base de datos lo haga en silencio). */
export async function deleteLocation(id: string): Promise<void> {
  await supabase.from("benefit_location_links").delete().eq("location_id", id);
  const { error } = await supabase.from("benefit_locations").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar la sede: ${error.message}`);
}
