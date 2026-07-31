"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { supabase } from "@/lib/mia/supabaseClient";

export async function inviteAdminUserAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  // Re-chequeo de rol en el propio server action (no solo ocultar el boton
  // en la UI) - un Server Action se puede invocar directo sin pasar por la
  // pantalla que lo oculta.
  const currentUser = await getCurrentAdminUser();
  if (!currentUser || currentUser.role !== "admin") {
    return { error: "No tienes permiso para crear usuarios." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!email || !fullName || (role !== "admin" && role !== "analista")) {
    return { error: "Completa todos los campos." };
  }

  // Los links de invitacion (a diferencia de un reset de password) son
  // siempre de flujo implicito (token en el fragmento de la URL, nunca
  // "?code=") - por eso apuntan a /admin/auth/confirm (pagina de cliente
  // que lee el hash), no a /admin/auth/callback (Route Handler para
  // "?code=", que nunca puede ver el fragmento).
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: "https://descuentosinteligentes.com/admin/auth/confirm",
  });
  if (error || !data.user) {
    return { error: `No se pudo invitar: ${error?.message ?? "error desconocido"}` };
  }

  const { error: insertError } = await supabase.from("admin_users").insert({
    auth_user_id: data.user.id,
    full_name: fullName,
    role,
    email,
  });
  if (insertError) {
    return { error: `Se invitó por correo, pero no se pudo guardar en admin_users: ${insertError.message}` };
  }

  revalidatePath("/admin/users");
  return undefined;
}
