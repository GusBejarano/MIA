"use server";

import { redirect } from "next/navigation";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";

export async function verifyEnrollAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "");

  const supabase = await createAdminAuthServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: "Código incorrecto, intenta de nuevo." };
  }

  redirect("/admin");
}
