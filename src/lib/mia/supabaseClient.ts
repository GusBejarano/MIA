import "server-only";
import { createClient } from "@supabase/supabase-js";

// Este cliente usa la service_role key, que ignora Row Level Security.
// El import "server-only" de arriba hace fallar el build si algun dia
// se importa este archivo desde un componente de cliente - la key nunca
// debe llegar al navegador.

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Copia .env.local.example a .env.local y llena los valores del proyecto de Supabase."
  );
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
