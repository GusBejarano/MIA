import { supabase } from "./supabaseClient";
import { colorForString } from "./colorPalette";
import { getRatingsForBenefits } from "./store";

/**
 * Capitaliza un valor de ciudad ya normalizado (minusculas, sin tildes -
 * ver city_list) para mostrarlo - ej. "jamundi" -> "Jamundi", "valle del
 * cauca" -> "Valle Del Cauca". Fallback temporal: lo correcto seria leer
 * `benefits.display_city_list` (grafia original, con tildes), pero esa
 * columna NO existe todavia en la base real - el archivo que la crea
 * (supabase/2026.07.27-mia_city_accent_normalization.sql) esta en el repo
 * desde julio pero nunca se corrio contra la base de datos (confirmado en
 * vivo: consultarla da error 42703, "column does not exist"). Cuando se
 * corra esa migracion, cambiar cityLabel para leer display_city_list en
 * vez de esto.
 */
function capitalizeCity(normalized: string): string {
  return normalized
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * % de descuento "desde" (el mas bajo de los que aparezcan) extraido del
 * texto libre de `conditions` - NO hay ningun campo estructurado de
 * descuento en el esquema (confirmado: benefits no tiene discount_percent
 * ni nada parecido, ni siquiera en raw_data). Heuristica de mejor
 * esfuerzo: busca todos los "N%" del texto y devuelve el minimo (criterio
 * "desde" - nunca promete de mas). Si el beneficio no tiene ningun
 * porcentaje en el texto (ej. "2x1", "domicilio gratis"), devuelve null y
 * la tarjeta simplemente no muestra el badge - nunca se inventa un numero.
 */
export function extractMinDiscountPercent(conditions: string | null): number | null {
  if (!conditions) return null;
  const matches = conditions.match(/\d{1,3}\s*%/g);
  if (!matches) return null;
  const values = matches
    .map((m) => parseInt(m, 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
  if (values.length === 0) return null;
  return Math.min(...values);
}

// Color de benefactor/programa deterministico por id - no podemos
// hardcodear un color por nombre porque la lista de benefactores crece con
// el tiempo (hoy 1, manana pueden ser 100). Paleta compartida en
// colorPalette.ts (tambien la usa BenefitThumbnail.tsx, por titulo).
export function colorForId(id: string): string {
  return colorForString(id);
}

export type BenefactorOption = {
  id: string;
  name: string;
  count: number;
  color: string;
};

type BenefactorCoverageRow = { source_program_id: string; benefit_count: number };

/**
 * Todos los benefactores con al menos un beneficio activo en la ciudad del
 * usuario - via la funcion RPC get_benefactor_coverage (agregado ya resuelto
 * en Postgres contra la vista materializada de cobertura, incluye
 * beneficios de departamento/pais que aplican a esa ciudad). Nunca trae el
 * catalogo completo a Node, sin importar cuantos beneficios haya.
 */
export async function getAvailableBenefactors(city: string): Promise<BenefactorOption[]> {
  const { data, error } = await supabase.rpc("get_benefactor_coverage", {
    target_city: city,
  });
  if (error) {
    throw new Error(`No se pudieron consultar los beneficios: ${error.message}`);
  }

  const rows = (data ?? []) as BenefactorCoverageRow[];
  if (rows.length === 0) return [];
  const countById = new Map(rows.map((r) => [r.source_program_id, Number(r.benefit_count)]));

  const { data: programRows, error: programsError } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", [...countById.keys()]);
  if (programsError) {
    throw new Error(`No se pudieron resolver los programas: ${programsError.message}`);
  }

  return (programRows ?? [])
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      count: countById.get(p.id as string) ?? 0,
      color: colorForId(p.id as string),
    }))
    .sort((a, b) => b.count - a.count);
}

export type ProgramOption = { id: string; name: string; color: string };

/**
 * Todos los benefactores del catalogo, sin filtrar por ciudad - a
 * diferencia de getAvailableBenefactors (que exige una ciudad porque
 * cuenta beneficios ahi), OnB-2 conecta un benefactor como afiliacion de
 * la persona, no como filtro geografico: `programs` no tiene columna de
 * ciudad.
 */
export async function getAllPrograms(): Promise<ProgramOption[]> {
  const { data, error } = await supabase.from("programs").select("id, name").order("name");
  if (error) {
    throw new Error(`No se pudieron consultar los benefactores: ${error.message}`);
  }
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    color: colorForId(p.id as string),
  }));
}

export type CityOption = {
  /** normalizada (minusculas, trim) - se usa como identificador para filtrar */
  value: string;
  /** version para mostrar, tal como aparece en la primera fila que la trae */
  label: string;
  count: number;
};

type CityCoverageRow = { city_value: string; city_label: string; benefit_count: number };

/**
 * Todas las ciudades con al menos un beneficio activo, con su conteo real,
 * de mayor a menor cobertura - via get_city_coverage (ver
 * supabase/2026.07.27-mia_geographic_hierarchy.sql para el detalle de como
 * se resuelve ciudad/departamento/pais). city_label ya viene con tilde
 * correcta desde city_regions.display_name, no adivinada.
 */
export async function getAvailableCities(): Promise<CityOption[]> {
  const { data, error } = await supabase.rpc("get_city_coverage");
  if (error) {
    throw new Error(`No se pudieron consultar las ciudades: ${error.message}`);
  }

  return ((data ?? []) as CityCoverageRow[]).map((row) => ({
    value: row.city_value,
    label: row.city_label,
    count: Number(row.benefit_count),
  }));
}

export type CategoryOption = {
  /** normalizada (minusculas, trim) - se usa como identificador para filtrar */
  value: string;
  /** version para mostrar, tal como aparece en la primera fila que la trae */
  label: string;
  count: number;
};

type CategoryCoverageRow = { category_value: string; category_label: string; benefit_count: number };

/** Categorias reales (atomicas, separando las compuestas por coma) de los benefactores elegidos - via get_category_coverage. */
export async function getAvailableCategories(
  programIds: string[],
  city: string
): Promise<CategoryOption[]> {
  if (programIds.length === 0) return [];

  const { data, error } = await supabase.rpc("get_category_coverage", {
    program_ids: programIds,
    target_city: city,
  });
  if (error) {
    throw new Error(`No se pudieron consultar las categorias: ${error.message}`);
  }

  return ((data ?? []) as CategoryCoverageRow[]).map((row) => ({
    value: row.category_value,
    label: row.category_label,
    count: Number(row.benefit_count),
  }));
}

export type BenefitCard = {
  id: string;
  title: string;
  tag: string;
  sourceProgram: string;
  thumbUrl: string | null;
};

/**
 * Todos los beneficios de una categoria (sin tope - el usuario ya eligio
 * explicitamente). resolve_city_scope trae las claves de alcance (ciudad +
 * departamento + pais) en una sola llamada; el filtro real (ciudad y
 * categoria) lo hace Postgres via los indices GIN de city_list/
 * category_list (.overlaps/.contains), nunca JS post-fetch.
 */
export async function getBenefitsForCategory(
  programIds: string[],
  categoryValue: string,
  categoryLabel: string,
  city: string
): Promise<BenefitCard[]> {
  if (programIds.length === 0) return [];

  const { data: scopeKeys, error: scopeError } = await supabase.rpc("resolve_city_scope", {
    target_city: city,
  });
  if (scopeError) {
    throw new Error(`No se pudo resolver el alcance de la ciudad: ${scopeError.message}`);
  }

  const { data, error } = await supabase
    .from("benefits")
    .select("id, title, source_program_id, image_url")
    .eq("status", "activo")
    .in("source_program_id", programIds)
    .overlaps("city_list", (scopeKeys ?? []) as string[])
    .contains("category_list", [categoryValue]);
  if (error) {
    throw new Error(`No se pudieron consultar los beneficios: ${error.message}`);
  }

  const { data: programRows, error: programsError } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", programIds);
  if (programsError) {
    throw new Error(`No se pudieron resolver los programas: ${programsError.message}`);
  }
  const nameById = new Map(
    (programRows ?? []).map((p) => [p.id as string, p.name as string])
  );

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    tag: categoryLabel,
    sourceProgram: nameById.get(row.source_program_id as string) ?? "",
    thumbUrl: (row.image_url as string) ?? null,
  }));
}

export type BenefitLocation = {
  id: string;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
};

/**
 * Sedes de un beneficio puntual, acotadas a la ciudad del usuario (mismo
 * patron que getBenefitsForCategory: resolve_city_scope + .overlaps() sobre
 * la columna _list generada) - un beneficio que cubre varias ciudades a la
 * vez (ej. Kosta Azul) solo devuelve las sedes de la ciudad actual, no todas.
 *
 * Lee por benefit_location_links (Admin v2.0, comercio compartido entre
 * benefactores) - NO por benefit_locations.benefit_id directo (columna
 * legacy que se retira en una fase posterior, una vez confirmado esto en
 * produccion). Un beneficio que todavia no tiene ningun vinculo en la tabla
 * puente (no migrado a comercio, la gran mayoria del catalogo hoy) devuelve
 * simplemente [] - el boton "Como llegar" cae solo al campo legacy de
 * benefits (how_to_get_there) cuando sedes viene vacio, sin cambio de
 * comportamiento para el catalogo no migrado.
 */
export async function getBenefitLocations(
  benefitId: string,
  city: string
): Promise<BenefitLocation[]> {
  const { data: linkRows, error: linkError } = await supabase
    .from("benefit_location_links")
    .select("location_id")
    .eq("benefit_id", benefitId);
  if (linkError) {
    throw new Error(`No se pudieron consultar los vínculos de sedes: ${linkError.message}`);
  }
  const locationIds = (linkRows ?? []).map((r) => r.location_id as string);
  if (locationIds.length === 0) return [];

  const { data: scopeKeys, error: scopeError } = await supabase.rpc("resolve_city_scope", {
    target_city: city,
  });
  if (scopeError) {
    throw new Error(`No se pudo resolver el alcance de la ciudad: ${scopeError.message}`);
  }

  const { data, error } = await supabase
    .from("benefit_locations")
    .select("id, maps_url, lat, lng")
    .in("id", locationIds)
    .overlaps("city_list", (scopeKeys ?? []) as string[]);
  if (error) {
    throw new Error(`No se pudieron consultar las sedes: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    mapsUrl: row.maps_url as string,
    lat: (row.lat as number) ?? null,
    lng: (row.lng as number) ?? null,
  }));
}

export type BenefitDetail = {
  id: string;
  title: string;
  tag: string;
  description: string;
  photoUrl: string | null;
  details: { label: string; value: string }[];
  links: { go: string | null; web: string | null; social: string | null };
  sourceProgramId: string;
  /** Como reclamar/usar el beneficio (ej. "presenta tu carne", "codigo X en la web") - null en beneficios/benefactores que todavia no tienen este dato capturado. */
  redemptionInstructions: string | null;
};

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function formatDateEs(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS_ES[month - 1]} ${year}`;
}

export async function getBenefitDetail(benefitId: string): Promise<BenefitDetail | null> {
  const { data, error } = await supabase
    .from("benefits")
    .select(
      "id, title, category, conditions, valid_until, image_url, company_url, social_media_url, how_to_get_there, address, source_program_id, redemption_instructions"
    )
    .eq("id", benefitId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo consultar el beneficio: ${error.message}`);
  }
  if (!data) return null;

  const details: { label: string; value: string }[] = [];
  if (data.valid_until) {
    details.push({ label: "Vigencia", value: `Hasta ${formatDateEs(data.valid_until as string)}` });
  }
  if (data.address) {
    details.push({ label: "Direccion", value: data.address as string });
  }

  return {
    id: data.id as string,
    title: data.title as string,
    tag: (data.category as string).split(",")[0]?.trim() ?? "",
    description: (data.conditions as string) ?? "",
    photoUrl: (data.image_url as string) ?? null,
    details,
    links: {
      go: (data.how_to_get_there as string) ?? null,
      web: (data.company_url as string) ?? null,
      social: (data.social_media_url as string) ?? null,
    },
    sourceProgramId: data.source_program_id as string,
    redemptionInstructions: (data.redemption_instructions as string | null) ?? null,
  };
}

/** Nombres de programas por id, para resolver benefactores cuando ya se tienen ids sueltos (ej. resultados del buscador de negocio, que no vienen agrupados por benefactor). */
export async function getProgramNamesByIds(programIds: string[]): Promise<Map<string, string>> {
  if (programIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", programIds);
  if (error) {
    throw new Error(`No se pudieron resolver los programas: ${error.message}`);
  }
  return new Map((data ?? []).map((p) => [p.id as string, p.name as string]));
}

const DAILY_DETAIL_VIEW_LIMIT = 3;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5 fijo, sin horario de verano

function startOfTodayBogotaISO(): string {
  const bogotaShifted = new Date(Date.now() - BOGOTA_OFFSET_MS);
  const startUtcMs =
    Date.UTC(
      bogotaShifted.getUTCFullYear(),
      bogotaShifted.getUTCMonth(),
      bogotaShifted.getUTCDate()
    ) + BOGOTA_OFFSET_MS;
  return new Date(startUtcMs).toISOString();
}

// ------------------------------------------------------------
// Onboarding v2 (dev 2.5) - tabs Conectados / Cerca de ti del home nuevo.
// ------------------------------------------------------------

export type ProgramPriority = { programId: string; prioridad: number };

export type ConnectedBenefitCard = BenefitCard & {
  categoryValues: string[];
  /** Calificacion (1-3) que el propio usuario le puso a ESTE beneficio, o 0 si nunca lo califico - misma fuente que benefit_ratings/DetailSheet.tsx. Usada por el filtro "Preferidos" de HomeTabs.tsx. */
  rating: number;
  /** Ciudad (de las ciudades de interes del usuario) donde este beneficio aplica - un beneficio puede tener varias, se muestra la primera que coincida. Nunca la ciudad "activa" de la app entera: Conectados mezcla tarjetas de todas las ciudades de interes a la vez. */
  cityLabel: string;
  /** "Desde X%" extraido de las condiciones en texto libre - ver extractMinDiscountPercent. null si el beneficio no trae ningun porcentaje detectable (no es un error, simplemente no se muestra el badge). */
  discountPercent: number | null;
};

/**
 * Beneficios de los benefactores conectados del usuario, en cualquiera de
 * sus ciudades de interes (union, no interseccion) - tab "Conectados". Sin
 * filtro de categoria, a diferencia de getBenefitsForCategory. Si
 * cityValues viene vacio (usuario nunca paso por OnB-3) devuelve [] en vez
 * de traer beneficios de cualquier ciudad - ninguna pantalla debe asumir
 * cobertura sin que el usuario haya elegido al menos una ciudad.
 *
 * `tag` sigue siendo el nombre del benefactor (mas util aqui que la
 * categoria, ya visible en la fila de filtro compartida) - `categoryValues`
 * es aparte, solo para que la fila de categorias de HomeTabs.tsx pueda
 * filtrar por coincidencia de VALOR normalizado (category_list), no por
 * comparar texto de `tag` contra la categoria (bug real: `tag` nunca fue la
 * categoria, el filtro no filtraba nada).
 *
 * Ordenado por tres niveles (feedback explicito, sexta prueba en vivo):
 * primero la calificacion propia del beneficio (1-3 estrellas, mas alta
 * primero, sin calificar = 0 al final), luego el % de descuento "desde"
 * (mas alto primero), y solo como ultimo desempate la prioridad (1-3
 * estrellas) que el usuario le dio al BENEFACTOR completo en "Mis
 * conexiones" (ver UserConnection.prioridad en store.ts). Esto es
 * exclusivo de este tab: NO toca getBenefitsForCategory (el catalogo por
 * categoria que tambien usa el carrusel del chat de produccion), que
 * tiene su propio orden sin relacion con esto.
 */
export async function getConnectedBenefits(
  programPriorities: ProgramPriority[],
  cityValues: string[],
  userId: string
): Promise<ConnectedBenefitCard[]> {
  if (programPriorities.length === 0 || cityValues.length === 0) return [];
  const programIds = programPriorities.map((p) => p.programId);
  const priorityById = new Map(programPriorities.map((p) => [p.programId, p.prioridad]));
  const userCityValues = new Set(cityValues);

  const scopeKeysByCity = await Promise.all(
    cityValues.map((city) => supabase.rpc("resolve_city_scope", { target_city: city }))
  );
  const scopeError = scopeKeysByCity.find((r) => r.error)?.error;
  if (scopeError) {
    throw new Error(`No se pudo resolver el alcance de las ciudades: ${scopeError.message}`);
  }
  const scopeKeys = [
    ...new Set(scopeKeysByCity.flatMap((r) => (r.data ?? []) as string[])),
  ];

  const { data, error } = await supabase
    .from("benefits")
    .select("id, title, source_program_id, image_url, category_list, city_list, conditions")
    .eq("status", "activo")
    .in("source_program_id", programIds)
    .overlaps("city_list", scopeKeys);
  if (error) {
    throw new Error(`No se pudieron consultar los beneficios conectados: ${error.message}`);
  }

  const { data: programRows, error: programsError } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", programIds);
  if (programsError) {
    throw new Error(`No se pudieron resolver los programas: ${programsError.message}`);
  }
  const nameById = new Map((programRows ?? []).map((p) => [p.id as string, p.name as string]));

  const ownRatingByBenefitId = await getRatingsForBenefits(userId, (data ?? []).map((row) => row.id as string));

  const cards: ConnectedBenefitCard[] = (data ?? []).map((row) => {
    const cityList = (row.city_list as string[] | null) ?? [];
    const matchedCity = cityList.find((c) => userCityValues.has(c)) ?? cityList[0];
    const cityLabel = matchedCity ? capitalizeCity(matchedCity) : "Nacional";
    return {
      id: row.id as string,
      title: row.title as string,
      tag: nameById.get(row.source_program_id as string) ?? "",
      sourceProgram: nameById.get(row.source_program_id as string) ?? "",
      thumbUrl: (row.image_url as string) ?? null,
      categoryValues: (row.category_list as string[] | null) ?? [],
      rating: ownRatingByBenefitId[row.id as string] ?? 0,
      cityLabel,
      discountPercent: extractMinDiscountPercent(row.conditions as string | null),
    };
  });
  const priorityByBenefitId = new Map(
    (data ?? []).map((row) => [
      row.id as string,
      priorityById.get(row.source_program_id as string) ?? 1,
    ])
  );

  return cards.sort((a, b) => {
    const ratingDiff = b.rating - a.rating;
    if (ratingDiff !== 0) return ratingDiff;
    const discountDiff = (b.discountPercent ?? -1) - (a.discountPercent ?? -1);
    if (discountDiff !== 0) return discountDiff;
    return (priorityByBenefitId.get(b.id) ?? 1) - (priorityByBenefitId.get(a.id) ?? 1);
  });
}

export type NearbyBenefitCard = BenefitCard & {
  lat: number;
  lng: number;
  categoryValues: string[];
  /** Calificacion (1-3) que el propio usuario le puso a ESTE beneficio, o 0 si nunca lo califico - ver ConnectedBenefitCard.rating. */
  rating: number;
  /** Ver ConnectedBenefitCard.cityLabel. */
  cityLabel: string;
  /** Ver ConnectedBenefitCard.discountPercent. */
  discountPercent: number | null;
};

/**
 * Beneficios de los benefactores conectados que tienen al menos una sede
 * geolocalizada (lat/lng no nulos) via benefit_location_links - tab "Cerca
 * de ti". No calcula distancia aqui - devuelve las coordenadas y el
 * cliente ordena con haversineKm (geolocationClient.ts) contra la posicion
 * del dispositivo, mismo patron que ya usa DetailSheet.tsx para ordenar
 * sedes por cercania. Beneficios sin coordenadas reales se excluyen del
 * todo (nunca se devuelven al final sin distancia real). Si un beneficio
 * tiene varias sedes, usa la primera con coordenadas.
 */
export async function getNearbyConnectedBenefits(
  programIds: string[],
  cityValues: string[],
  userId: string
): Promise<NearbyBenefitCard[]> {
  if (programIds.length === 0) return [];
  const userCityValues = new Set(cityValues);

  const { data: linkRows, error: linkError } = await supabase
    .from("benefit_location_links")
    .select("benefit_id, location_id");
  if (linkError) {
    throw new Error(`No se pudieron consultar los vínculos de sedes: ${linkError.message}`);
  }
  if (!linkRows || linkRows.length === 0) return [];

  const locationIds = [...new Set(linkRows.map((r) => r.location_id as string))];
  const { data: locationRows, error: locationError } = await supabase
    .from("benefit_locations")
    .select("id, lat, lng")
    .in("id", locationIds)
    .not("lat", "is", null)
    .not("lng", "is", null);
  if (locationError) {
    throw new Error(`No se pudieron consultar las sedes: ${locationError.message}`);
  }
  const coordsByLocationId = new Map(
    (locationRows ?? []).map((r) => [r.id as string, { lat: r.lat as number, lng: r.lng as number }])
  );
  if (coordsByLocationId.size === 0) return [];

  const coordsByBenefit = new Map<string, { lat: number; lng: number }>();
  for (const link of linkRows) {
    const benefitId = link.benefit_id as string;
    if (coordsByBenefit.has(benefitId)) continue;
    const coords = coordsByLocationId.get(link.location_id as string);
    if (coords) coordsByBenefit.set(benefitId, coords);
  }
  if (coordsByBenefit.size === 0) return [];

  const { data: benefitRows, error: benefitsError } = await supabase
    .from("benefits")
    .select("id, title, source_program_id, image_url, category_list, city_list, conditions")
    .eq("status", "activo")
    .in("source_program_id", programIds)
    .in("id", [...coordsByBenefit.keys()]);
  if (benefitsError) {
    throw new Error(`No se pudieron consultar los beneficios cercanos: ${benefitsError.message}`);
  }
  if (!benefitRows || benefitRows.length === 0) return [];

  const { data: programRows, error: programsError } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", programIds);
  if (programsError) {
    throw new Error(`No se pudieron resolver los programas: ${programsError.message}`);
  }
  const nameById = new Map((programRows ?? []).map((p) => [p.id as string, p.name as string]));
  const ownRatingByBenefitId = await getRatingsForBenefits(userId, benefitRows.map((row) => row.id as string));

  return benefitRows.map((row) => {
    const coords = coordsByBenefit.get(row.id as string)!;
    const cityList = (row.city_list as string[] | null) ?? [];
    const matchedCity = cityList.find((c) => userCityValues.has(c)) ?? cityList[0];
    const cityLabel = matchedCity ? capitalizeCity(matchedCity) : "Nacional";
    return {
      id: row.id as string,
      title: row.title as string,
      tag: nameById.get(row.source_program_id as string) ?? "",
      sourceProgram: nameById.get(row.source_program_id as string) ?? "",
      thumbUrl: (row.image_url as string) ?? null,
      lat: coords.lat,
      lng: coords.lng,
      categoryValues: (row.category_list as string[] | null) ?? [],
      rating: ownRatingByBenefitId[row.id as string] ?? 0,
      cityLabel,
      discountPercent: extractMinDiscountPercent(row.conditions as string | null),
    };
  });
}

/** Cuantos beneficios distintos ha visto en detalle hoy (horario Colombia). */
export async function getDailyDetailViewCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("benefit_exposures")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("shown_at", startOfTodayBogotaISO());
  if (error) {
    throw new Error(`No se pudo consultar el limite diario: ${error.message}`);
  }
  return count ?? 0;
}

export { DAILY_DETAIL_VIEW_LIMIT };
