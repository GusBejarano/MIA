import { supabase } from "./supabaseClient";
import { hashPhone } from "./phoneHash";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UserProfile = {
  id: string;
  city: string | null;
  locationPermissionGranted: boolean;
};

/**
 * Busca al usuario por el hash de su telefono, o lo crea si es la
 * primera vez que escribe. Devuelve su ciudad y permiso de ubicacion
 * guardados (si los tiene) - esto es lo que le permite a un usuario que
 * regresa saltarse la pregunta de ubicacion.
 */
export async function getOrCreateUser(phone: string): Promise<UserProfile> {
  const phoneHash = hashPhone(phone);

  const { data, error } = await supabase
    .from("users")
    .upsert(
      { phone_hash: phoneHash, last_active_at: new Date().toISOString() },
      { onConflict: "phone_hash" }
    )
    .select("id, city, location_permission_granted")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo crear/recuperar el usuario en Supabase: ${error?.message}`
    );
  }

  const userId = data.id as string;

  // Guardado adicional de mejor esfuerzo, solo para consulta administrativa
  // directa en Supabase (users.whatsapp_number) - nunca debe poder romper
  // ni bloquear el reconocimiento/creacion del usuario si falla. No
  // reemplaza ni toca nada del flujo de phone_hash (reconocimiento entre
  // visitas, prellenado), corre aparte y en paralelo a el.
  try {
    await saveWhatsappNumber(userId, phone);
  } catch (err) {
    console.error("No se pudo guardar whatsapp_number (no bloqueante):", err);
  }

  return {
    id: userId,
    city: (data.city as string | null) ?? null,
    locationPermissionGranted: Boolean(data.location_permission_granted),
  };
}

/**
 * Guarda el numero tal cual lo escribio el usuario (sin normalizar, con o
 * sin "+57") en users.whatsapp_number - solo para consulta administrativa
 * directa en Supabase, nunca se lee ni se muestra desde la app. No es la
 * fuente de verdad de identidad (eso sigue siendo phone_hash); es
 * puramente informativo.
 */
export async function saveWhatsappNumber(userId: string, rawPhone: string) {
  const { error } = await supabase
    .from("users")
    .update({ whatsapp_number: rawPhone })
    .eq("id", userId);
  if (error) {
    throw new Error(`No se pudo guardar whatsapp_number: ${error.message}`);
  }
}

/**
 * Marca que el usuario ya concedio el permiso de ubicacion, para no
 * volver a pedirselo en sesiones futuras. Se llama una sola vez, la
 * primera vez que lo concede.
 */
export async function saveLocationPermission(userId: string) {
  const { error: userError } = await supabase
    .from("users")
    .update({ location_permission_granted: true })
    .eq("id", userId);
  if (userError) {
    throw new Error(
      `No se pudo guardar el permiso de ubicacion: ${userError.message}`
    );
  }

  const { error: eventError } = await supabase.from("events").insert({
    user_id: userId,
    event_type: "location_permission_granted",
  });
  if (eventError) {
    throw new Error(
      `No se pudo registrar el evento location_permission_granted: ${eventError.message}`
    );
  }
}

/**
 * Un evento por visita real (no por mensaje) - ver MiaChat.tsx para el
 * gate de sessionStorage que evita duplicarlo en refrescos de pagina
 * dentro de la misma visita. Uniforme para usuarios nuevos y que
 * regresan, para poder calcular retencion (dia 1/7/30) comparando la
 * primera ocurrencia de este evento por usuario contra las siguientes.
 */
export async function saveSessionStarted(userId: string) {
  const { error } = await supabase.from("events").insert({
    user_id: userId,
    event_type: "session_started",
  });
  if (error) {
    throw new Error(
      `No se pudo registrar el evento session_started: ${error.message}`
    );
  }
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

/** Calificacion (1-3) que el usuario le dio a un beneficio, o 0 si nunca lo califico. */
export async function getRating(userId: string, benefitId: string): Promise<number> {
  const { data, error } = await supabase
    .from("benefit_ratings")
    .select("rating")
    .eq("user_id", userId)
    .eq("benefit_id", benefitId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo consultar la calificacion: ${error.message}`);
  }
  return (data?.rating as number | undefined) ?? 0;
}

/** Calificaciones del usuario para varios beneficios a la vez (una sola consulta, para el carrusel). */
export async function getRatingsForBenefits(
  userId: string,
  benefitIds: string[]
): Promise<Record<string, number>> {
  if (benefitIds.length === 0) return {};

  const { data, error } = await supabase
    .from("benefit_ratings")
    .select("benefit_id, rating")
    .eq("user_id", userId)
    .in("benefit_id", benefitIds);
  if (error) {
    throw new Error(`No se pudieron consultar las calificaciones: ${error.message}`);
  }

  const ratings: Record<string, number> = {};
  for (const row of data ?? []) {
    ratings[row.benefit_id as string] = row.rating as number;
  }
  return ratings;
}

/** Momento del ultimo uso exitoso (con o sin match) del buscador de negocio, o null si nunca lo uso - fuente de verdad para el estado ensenar/recordar (ver onboarding.ts). */
export async function getLastBusinessSearchAt(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("last_business_search_at")
    .eq("id", userId)
    .single();
  if (error) {
    throw new Error(`No se pudo leer last_business_search_at: ${error.message}`);
  }
  return (data?.last_business_search_at as string | null) ?? null;
}

/**
 * Marca que el usuario uso el buscador de negocio - se llama en los 4
 * resultados de la ramificacion (1 resultado, 2+, fuera de ciudad, no
 * encontrado): el intento en si ya cuenta como "aprendido", no solo un
 * match exitoso.
 */
export async function markBusinessSearchUsed(userId: string) {
  const { error } = await supabase
    .from("users")
    .update({ last_business_search_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    throw new Error(`No se pudo actualizar last_business_search_at: ${error.message}`);
  }
}

/** Registra un intento de busqueda de negocio sin cobertura (fuera de ciudad o inexistente) - senal para el equipo de alianzas, sin accion automatica. */
export async function logBusinessSearchEvent(
  userId: string,
  eventType: "business_search_miss" | "business_search_out_of_city",
  query: string
) {
  const { error } = await supabase.from("events").insert({
    user_id: userId,
    event_type: eventType,
    payload: { query },
  });
  if (error) {
    throw new Error(`No se pudo registrar el evento ${eventType}: ${error.message}`);
  }
}

const DEFAULT_REMINDER_DAYS = 30;

/** Umbral (en dias) del tip de recordatorio del buscador de negocio - leido de app_settings para poder cambiarlo desde Supabase sin redeploy. */
export async function getReminderThresholdDays(): Promise<number> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "business_search_reminder_days")
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo leer app_settings: ${error.message}`);
  }
  const parsed = Number(data?.value);
  // Fallback defensivo (nunca deberia usarse en un ambiente sano - la fila
  // semilla ya existe) para que un valor ausente o corrupto en Supabase
  // nunca rompa el flujo, solo caiga al default razonable.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REMINDER_DAYS;
}

/**
 * Fija la calificacion de un beneficio (1-3), o la borra si `rating` es 0 -
 * la tabla tiene `CHECK (rating IN (1,2,3))`, 0 no es un valor guardable.
 */
export async function setRating(userId: string, benefitId: string, rating: number) {
  if (rating === 0) {
    const { error } = await supabase
      .from("benefit_ratings")
      .delete()
      .eq("user_id", userId)
      .eq("benefit_id", benefitId);
    if (error) {
      throw new Error(`No se pudo borrar la calificacion: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase
    .from("benefit_ratings")
    .upsert(
      { user_id: userId, benefit_id: benefitId, rating },
      { onConflict: "user_id,benefit_id" }
    );
  if (error) {
    throw new Error(`No se pudo guardar la calificacion: ${error.message}`);
  }
}

// ------------------------------------------------------------
// Aprendizaje progresivo del perfil (v1.4, Gap 1)
// ------------------------------------------------------------

export type ProfileLearningField = {
  fieldKey: string;
  priority: number;
  promptText: string;
};

/** Campos activos de profile_learning_fields, en orden de prioridad. */
export async function getActiveProfileLearningFields(): Promise<ProfileLearningField[]> {
  const { data, error } = await supabase
    .from("profile_learning_fields")
    .select("field_key, priority, prompt_text")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error) {
    throw new Error(`No se pudieron consultar profile_learning_fields: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    fieldKey: r.field_key as string,
    priority: r.priority as number,
    promptText: r.prompt_text as string,
  }));
}

type ProfileLearningState = {
  fieldKey: string;
  answered: boolean;
  attempts: number;
  updatedAt: string | null;
};

async function getProfileLearningState(userId: string): Promise<ProfileLearningState[]> {
  const { data, error } = await supabase
    .from("user_profile_learning_state")
    .select("field_key, answered, attempts, updated_at")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`No se pudo consultar user_profile_learning_state: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    fieldKey: r.field_key as string,
    answered: r.answered as boolean,
    attempts: r.attempts as number,
    updatedAt: (r.updated_at as string | null) ?? null,
  }));
}

/**
 * Campo elegible siguiente en la rotacion name -> gender -> birth_date ->
 * name -> ... : de los campos activos que TODAVIA NO ESTAN CONTESTADOS
 * (sin fila, o con `answered = false` - ya no importa cuantos `attempts`
 * lleve, declinar nunca descarta un campo para siempre), elige el que
 * lleva mas tiempo sin preguntarse - los nunca preguntados (sin fila)
 * cuentan como "los mas atrasados de todos", y entre varios nunca
 * preguntados se desempata por prioridad (asi un usuario nuevo siempre
 * arranca en `name`). `null` solo cuando los 3 ya estan contestados.
 */
export async function selectPendingProfileField(
  userId: string
): Promise<ProfileLearningField | null> {
  const [fields, states] = await Promise.all([
    getActiveProfileLearningFields(),
    getProfileLearningState(userId),
  ]);
  const stateByField = new Map(states.map((s) => [s.fieldKey, s]));

  const pending = fields.filter((f) => !stateByField.get(f.fieldKey)?.answered);
  if (pending.length === 0) return null;

  pending.sort((a, b) => {
    const updatedA = stateByField.get(a.fieldKey)?.updatedAt;
    const updatedB = stateByField.get(b.fieldKey)?.updatedAt;
    const timeA = updatedA ? new Date(updatedA).getTime() : -1;
    const timeB = updatedB ? new Date(updatedB).getTime() : -1;
    if (timeA !== timeB) return timeA - timeB;
    return a.priority - b.priority;
  });

  return pending[0];
}

/**
 * Registra que se le acaba de preguntar un campo - bump de `updated_at` a
 * ahora, preservando `attempts`/`answered` si ya existia una fila. Se
 * llama al PREGUNTAR (no solo al confirmar/declinar): si no se hiciera
 * aca, un usuario que responde algo interpretable (dispara la
 * confirmacion) pero nunca la resuelve (abandona el chat) dejaria ese
 * campo marcado como "nunca preguntado" - empataria en la rotacion con
 * campos de verdad nunca preguntados y podria volver a salir antes de
 * tiempo, rompiendo el ciclo name -> gender -> birth_date -> name -> ...
 */
export async function recordProfileFieldAsked(userId: string, fieldKey: string) {
  const { data: existing, error: readError } = await supabase
    .from("user_profile_learning_state")
    .select("attempts, answered")
    .eq("user_id", userId)
    .eq("field_key", fieldKey)
    .maybeSingle();
  if (readError) {
    throw new Error(`No se pudo leer el estado de ${fieldKey}: ${readError.message}`);
  }

  const { error } = await supabase
    .from("user_profile_learning_state")
    .upsert(
      {
        user_id: userId,
        field_key: fieldKey,
        answered: (existing?.answered as boolean | undefined) ?? false,
        attempts: (existing?.attempts as number | undefined) ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,field_key" }
    );
  if (error) {
    throw new Error(`No se pudo registrar que se pregunto ${fieldKey}: ${error.message}`);
  }
}

/** Marca un campo como contestado y confirmado - queda fuera de la rotacion para siempre. */
export async function recordProfileFieldAnswered(userId: string, fieldKey: string) {
  const { error } = await supabase
    .from("user_profile_learning_state")
    .upsert(
      { user_id: userId, field_key: fieldKey, answered: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id,field_key" }
    );
  if (error) {
    throw new Error(`No se pudo marcar ${fieldKey} como contestado: ${error.message}`);
  }
}

/**
 * Registra que se pregunto el campo y el usuario declino (o su respuesta
 * no traia un valor usable) - suma 1 a `attempts` (solo informativo, ya no
 * descarta el campo) y actualiza `updated_at` a ahora, para que la
 * rotacion le de la vuelta a los otros 2 campos antes de volver a
 * preguntar este. Lectura + escritura (no atomico a nivel de fila):
 * aceptable porque solo un usuario, en su propia conversacion secuencial,
 * escribe su propia fila - no hay escritura concurrente real.
 */
export async function recordProfileFieldDeclined(userId: string, fieldKey: string) {
  const { data: existing, error: readError } = await supabase
    .from("user_profile_learning_state")
    .select("attempts")
    .eq("user_id", userId)
    .eq("field_key", fieldKey)
    .maybeSingle();
  if (readError) {
    throw new Error(`No se pudo leer el estado de ${fieldKey}: ${readError.message}`);
  }

  const nextAttempts = ((existing?.attempts as number | undefined) ?? 0) + 1;
  const { error } = await supabase
    .from("user_profile_learning_state")
    .upsert(
      {
        user_id: userId,
        field_key: fieldKey,
        answered: false,
        attempts: nextAttempts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,field_key" }
    );
  if (error) {
    throw new Error(`No se pudo registrar el intento de ${fieldKey}: ${error.message}`);
  }
}

/** Guarda el valor confirmado en la columna real de `users` - field_key coincide 1:1 con el nombre de columna (name/gender/birth_date). */
export async function saveProfileFieldValue(userId: string, fieldKey: string, value: string) {
  const { error } = await supabase
    .from("users")
    .update({ [fieldKey]: value })
    .eq("id", userId);
  if (error) {
    throw new Error(`No se pudo guardar ${fieldKey}: ${error.message}`);
  }
}
