import { supabase } from "./supabaseClient";
import { hashPhone } from "./phoneHash";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Busca al usuario por el hash de su telefono, o lo crea si es la
 * primera vez que escribe. Devuelve el id (uuid) de la fila en `users`.
 */
export async function getOrCreateUserId(phone: string): Promise<string> {
  const phoneHash = hashPhone(phone);

  const { data, error } = await supabase
    .from("users")
    .upsert(
      { phone_hash: phoneHash, last_active_at: new Date().toISOString() },
      { onConflict: "phone_hash" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo crear/recuperar el usuario en Supabase: ${error?.message}`
    );
  }
  return data.id as string;
}

export async function saveCity(
  userId: string,
  city: string,
  method: "geolocation" | "manual"
) {
  const { error: userError } = await supabase
    .from("users")
    .update({ city })
    .eq("id", userId);
  if (userError) {
    throw new Error(`No se pudo guardar la ciudad del usuario: ${userError.message}`);
  }

  const { error: eventError } = await supabase.from("events").insert({
    user_id: userId,
    event_type: "city_detected",
    payload: { city, method },
  });
  if (eventError) {
    throw new Error(
      `No se pudo registrar el evento city_detected: ${eventError.message}`
    );
  }
}

/** Ultima ciudad guardada del usuario (de cualquier sesion anterior), o null si nunca se guardo una. */
export async function getUserCity(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("city")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo leer la ciudad del usuario: ${error.message}`);
  }
  return (data?.city as string | null) ?? null;
}

export async function saveCityInterest(userId: string, city: string) {
  const { error } = await supabase.from("events").insert({
    user_id: userId,
    event_type: "city_interest_declared",
    payload: { city },
  });
  if (error) {
    throw new Error(
      `No se pudo registrar el interes de ciudad: ${error.message}`
    );
  }
}

export async function saveAffinity(userId: string, category: string) {
  const { error } = await supabase.from("affinities").upsert(
    {
      user_id: userId,
      category,
      source: "declarada",
      weight: 1.0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,category" }
  );
  if (error) {
    throw new Error(`No se pudo guardar la afinidad: ${error.message}`);
  }
}

/** Guarda los benefactores (programas) que el usuario eligio, ya como ids reales. */
export async function saveProgramSelections(userId: string, programIds: string[]) {
  if (programIds.length === 0) return;

  const rows = programIds.map((programId) => ({
    user_id: userId,
    program_id: programId,
  }));

  const { error } = await supabase
    .from("user_programs")
    .upsert(rows, { onConflict: "user_id,program_id", ignoreDuplicates: true });
  if (error) {
    throw new Error(`No se pudieron guardar los programas: ${error.message}`);
  }
}

/** Ids (uuid) de los programas que el usuario declaro tener. */
export async function getUserProgramIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_programs")
    .select("program_id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`No se pudieron leer los programas del usuario: ${error.message}`);
  }
  return (data ?? []).map((row) => row.program_id as string);
}

/** Ids (uuid) de los beneficios ya mostrados a este usuario, para no repetirlos. */
export async function getExposedBenefitIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("benefit_exposures")
    .select("benefit_id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`No se pudieron leer las exposiciones previas: ${error.message}`);
  }
  return (data ?? []).map((row) => row.benefit_id as string);
}

export async function saveExposure(userId: string, benefitId: string) {
  // Guard defensivo: benefit_id siempre deberia ser un uuid real de la
  // tabla benefits. Si algo mas arriba genera un id malformado, se ignora
  // en silencio en vez de romper la conversacion.
  if (!UUID_RE.test(benefitId)) return;

  const { error } = await supabase.from("benefit_exposures").insert({
    user_id: userId,
    benefit_id: benefitId,
    channel: "chat_web",
  });
  if (error) {
    throw new Error(
      `No se pudo registrar la exposicion del beneficio: ${error.message}`
    );
  }
}
