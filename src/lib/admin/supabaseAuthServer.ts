import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de Supabase Auth para Server Components/Server Actions del panel
// /admin - usa la key publishable (respeta Auth/RLS), NO la service_role key
// (esa sigue siendo exclusiva de src/lib/mia/supabaseClient.ts para datos).
// La sesion (login + 2FA) viaja en cookies via @supabase/ssr - nunca se
// expone ninguna key de Supabase al navegador, el cliente JS de
// supabase-auth nunca corre ahi.
export async function createAdminAuthServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Un Server Component no puede escribir cookies (solo Server
            // Actions/Route Handlers pueden) - se ignora a proposito, la
            // sesion ya viene resuelta por el middleware en ese caso.
          }
        },
      },
    }
  );
}
