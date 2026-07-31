import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Protege /admin/** (panel administrativo, Fase 3) - completamente aparte
// de la app publica de MIA, que no pasa por este middleware (matcher de
// abajo solo cubre /admin). Estas rutas quedan siempre accesibles sin
// sesion porque SON el propio flujo de autenticacion/2FA:
const PUBLIC_ADMIN_PATHS = [
  "/admin/login",
  "/admin/auth/callback",
  "/admin/set-password",
  "/admin/mfa/enroll",
];

export async function middleware(request: NextRequest) {
  if (PUBLIC_ADMIN_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // Exige 2FA verificado (aal2), no solo password (aal1) - un usuario que
  // aun no completo el reto TOTP de esta sesion no debe poder entrar al
  // panel, aunque su password ya haya sido correcto.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
