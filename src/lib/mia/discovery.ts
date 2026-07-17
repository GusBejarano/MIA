import { supabase } from "./supabaseClient";
import { cityMatches } from "./cityMatch";

// Paleta de marca (violeta/cian + acentos) para asignar color a benefactores
// de forma deterministica - no podemos hardcodear un color por nombre porque
// la lista de benefactores crece con el tiempo (hoy 1, manana pueden ser 100).
const CHIP_COLOR_PALETTE = [
  "#6C4CF1",
  "#22D3EE",
  "#9B6CF0",
  "#4C7DFB",
  "#3EB6C4",
  "#F59E0B",
  "#EC4899",
  "#10B981",
];

export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CHIP_COLOR_PALETTE[hash % CHIP_COLOR_PALETTE.length];
}

export type BenefactorOption = {
  id: string;
  name: string;
  count: number;
  color: string;
};

/** Todos los benefactores con al menos un beneficio activo en la ciudad del usuario. */
export async function getAvailableBenefactors(city: string): Promise<BenefactorOption[]> {
  const { data, error } = await supabase
    .from("benefits")
    .select("source_program_id, city")
    .eq("status", "activo");
  if (error) {
    throw new Error(`No se pudieron consultar los beneficios: ${error.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!cityMatches(row.city as string, city)) continue;
    const id = row.source_program_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const { data: programRows, error: programsError } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", [...counts.keys()]);
  if (programsError) {
    throw new Error(`No se pudieron resolver los programas: ${programsError.message}`);
  }

  return (programRows ?? [])
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      count: counts.get(p.id as string) ?? 0,
      color: colorForId(p.id as string),
    }))
    .sort((a, b) => b.count - a.count);
}

export type CityOption = {
  /** normalizada (minusculas, trim) - se usa como identificador para filtrar */
  value: string;
  /** version para mostrar, tal como aparece en la primera fila que la trae */
  label: string;
  count: number;
};

/**
 * Todas las ciudades con al menos un beneficio activo, con su conteo real,
 * de mayor a menor cobertura. El campo `city` es texto libre y puede traer
 * varias ciudades separadas por coma (ver cityMatch.ts) - se descarta
 * "Colombia" porque es el pais, no una ciudad (aparece como ultimo pedazo
 * en ese formato), nunca una cobertura real en si misma.
 */
export async function getAvailableCities(): Promise<CityOption[]> {
  const { data, error } = await supabase
    .from("benefits")
    .select("city")
    .eq("status", "activo");
  if (error) {
    throw new Error(`No se pudieron consultar las ciudades: ${error.message}`);
  }

  const counts = new Map<string, { label: string; count: number }>();
  for (const row of data ?? []) {
    const pieces = (row.city as string)
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p && p.toLowerCase() !== "colombia");
    for (const piece of pieces) {
      const key = piece.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label: piece, count: 1 });
    }
  }

  return [...counts.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count);
}

export type CategoryOption = {
  /** normalizada (minusculas, trim) - se usa como identificador para filtrar */
  value: string;
  /** version para mostrar, tal como aparece en la primera fila que la trae */
  label: string;
  count: number;
};

/** Categorias reales (atomicas, separando las compuestas por coma) de los benefactores elegidos. */
export async function getAvailableCategories(
  programIds: string[],
  city: string
): Promise<CategoryOption[]> {
  if (programIds.length === 0) return [];

  const { data, error } = await supabase
    .from("benefits")
    .select("category, city")
    .eq("status", "activo")
    .in("source_program_id", programIds);
  if (error) {
    throw new Error(`No se pudieron consultar las categorias: ${error.message}`);
  }

  const counts = new Map<string, { label: string; count: number }>();
  for (const row of data ?? []) {
    if (!cityMatches(row.city as string, city)) continue;
    const pieces = (row.category as string)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const piece of pieces) {
      const key = piece.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label: piece, count: 1 });
    }
  }

  return [...counts.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count);
}

export type BenefitCard = {
  id: string;
  title: string;
  tag: string;
  sourceProgram: string;
  thumbUrl: string | null;
};

/** Todos los beneficios de una categoria (sin tope - el usuario ya eligio explicitamente). */
export async function getBenefitsForCategory(
  programIds: string[],
  categoryValue: string,
  categoryLabel: string,
  city: string
): Promise<BenefitCard[]> {
  if (programIds.length === 0) return [];

  const { data, error } = await supabase
    .from("benefits")
    .select("id, title, category, city, source_program_id, image_url")
    .eq("status", "activo")
    .in("source_program_id", programIds);
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

  return (data ?? [])
    .filter((row) => cityMatches(row.city as string, city))
    .filter((row) =>
      (row.category as string)
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .includes(categoryValue)
    )
    .map((row) => ({
      id: row.id as string,
      title: row.title as string,
      tag: categoryLabel,
      sourceProgram: nameById.get(row.source_program_id as string) ?? "",
      thumbUrl: (row.image_url as string) ?? null,
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
};

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatDateEs(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS_ES[month - 1]} ${year}`;
}

export async function getBenefitDetail(benefitId: string): Promise<BenefitDetail | null> {
  const { data, error } = await supabase
    .from("benefits")
    .select(
      "id, title, category, conditions, valid_until, image_url, company_url, social_media_url, how_to_get_there, address"
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
  };
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
