"use server";

import { redirect } from "next/navigation";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";

/**
 * Establece la sesion server-side (cookies) a partir de los tokens que
 * llegan en el fragmento de la URL de un link de invitacion/magic-link -
 * esos links son siempre de flujo "implicito" (nunca "?code=") por diseño
 * de Supabase, porque se espera que se abran en cualquier dispositivo, no
 * necesariamente el mismo donde se inicio el flujo (a diferencia de
 * resetPasswordForEmail, que si soporta PKCE porque asume mismo
 * navegador). Por eso esto vive en un Server Action invocado desde un
 * Client Component que lee el hash - un Route Handler nunca puede leerlo.
 */
export async function confirmHashSessionAction(accessToken: string, refreshToken: string) {
  const supabase = await createAdminAuthServerClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    redirect(`/admin/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/set-password");
}
