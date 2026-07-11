import "server-only";
import { supabase } from "./supabaseClient.js";
import { hashPhone } from "./phoneHash.js";

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

export async function savePrograms(userId: string, programs: string[]) {
  if (programs.length === 0) return;

  const { data: matchedPrograms, error: lookupError } = await supabase
    .from("programs")
    .select("id, name")
    .in("name", programs);
  if (lookupError) {
    throw new Error(
      `No se pudieron resolver los programas declarados: ${lookupError.message}`
    );
  }

  const rows = (matchedPrograms ?? []).map((program) => ({
    user_id: userId,
    program_id: program.id as string,
  }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("user_programs")
    .upsert(rows, { onConflict: "user_id,program_id", ignoreDuplicates: true });
  if (error) {
    throw new Error(`No se pudieron guardar los programas: ${error.message}`);
  }
}

export async function saveExposure(userId: string, benefitId: string) {
  // El catalogo real de beneficios (Fase 3) todavia no esta cargado en
  // Supabase - mockBenefits.ts sigue generando ids de prueba ("b1", "b2"...)
  // que no son UUID y no existen en la tabla benefits. Se ignoran en
  // silencio hasta que el catalogo real reemplace mockBenefits.ts.
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
