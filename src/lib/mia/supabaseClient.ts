import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// Este cliente usa la service_role key, que ignora Row Level Security.
// No usamos el paquete "server-only" aqui: su chequeo depende de la
// condicion "react-server" que solo inyecta el bundler de Next.js, asi
// que bajo Node plano (scripts/mia-cli.ts, corrido con tsx) siempre
// lanzaba error sin importar el contexto real. El chequeo de "window"
// de abajo funciona igual en Node (CLI y rutas de API) y en el navegador.
if (typeof window !== "undefined") {
  throw new Error(
    "supabaseClient.ts es solo para el servidor. Nunca lo importes desde un componente de cliente - la service_role key no debe llegar al navegador."
  );
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Copia .env.local.example a .env.local y llena los valores del proyecto de Supabase."
  );
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  // No usamos Realtime (solo REST via .from()), pero el cliente igual
  // intenta resolver un WebSocket nativo al construirse, y Node < 22 no
  // trae uno - sin esto, createClient() lanza error antes de la primera
  // consulta. Node 20 (el que corre este proyecto) lo necesita.
  realtime: { transport: ws as unknown as typeof WebSocket },
});
