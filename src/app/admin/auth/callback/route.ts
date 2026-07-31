import { NextResponse, type NextRequest } from "next/server";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";

// Recibe el link de invitacion/recuperacion que manda Supabase Auth por
// correo (flujo PKCE: llega con ?code=..., no con el token en el hash) y lo
// canjea por una sesion real de cookies. De aqui siempre se manda a
// set-password - un usuario recien invitado (o que resetea password) debe
// definir su contraseña real antes de poder usar el panel.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createAdminAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/admin/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }
  }

  return NextResponse.redirect(new URL("/admin/set-password", request.url));
}
