"use server";

import { redirect } from "next/navigation";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";

export async function setPasswordAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createAdminAuthServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = factors?.totp.some((f) => f.status === "verified");

  redirect(hasVerifiedTotp ? "/admin" : "/admin/mfa/enroll");
}
