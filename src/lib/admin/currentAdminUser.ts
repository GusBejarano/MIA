import { createAdminAuthServerClient } from "./supabaseAuthServer";
import { supabase as supabaseService } from "@/lib/mia/supabaseClient";

export type CurrentAdminUser = {
  id: string;
  authUserId: string;
  fullName: string;
  role: "admin" | "analista";
  email: string;
};

/**
 * Resuelve el admin_users de la sesion actual, cruzando la sesion de
 * Supabase Auth (cookies, key publishable) con la fila de datos real
 * (service_role, igual que el resto de la app) - dos clientes de Supabase
 * distintos a proposito, cada uno para lo que le corresponde.
 */
export async function getCurrentAdminUser(): Promise<CurrentAdminUser | null> {
  const authClient = await createAdminAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabaseService
    .from("admin_users")
    .select("id, auth_user_id, full_name, role, email, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;

  return {
    id: data.id as string,
    authUserId: data.auth_user_id as string,
    fullName: data.full_name as string,
    role: data.role as "admin" | "analista",
    email: data.email as string,
  };
}
