"use server";

import { redirect } from "next/navigation";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";

export type LoginState =
  | { step: "password"; error?: string }
  | { step: "totp"; factorId: string; error?: string };

const INITIAL_STATE: LoginState = { step: "password" };

export async function loginAction(
  prevState: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const state = prevState ?? INITIAL_STATE;
  const supabase = await createAdminAuthServerClient();

  if (state.step === "password") {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return { step: "password", error: "Correo o contraseña incorrectos." };
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verifiedTotp = factors?.totp.find((f) => f.status === "verified");

    if (!verifiedTotp) {
      // No debería pasar en uso normal (todo usuario pasa por
      // /admin/mfa/enroll antes de llegar aca), pero si pasa, lo manda a
      // enrolar en vez de dejarlo atascado.
      redirect("/admin/mfa/enroll");
    }

    return { step: "totp", factorId: verifiedTotp.id };
  }

  // step === "totp"
  const code = String(formData.get("code") ?? "");
  const { error, data } = await supabase.auth.mfa.challengeAndVerify({
    factorId: state.factorId,
    code,
  });
  console.log("[DIAG loginAction totp] error:", error?.message, "verify data aal:", (data as { aal?: string } | null)?.aal);
  if (error) {
    return { step: "totp", factorId: state.factorId, error: "Código incorrecto." };
  }

  const { data: aalAfter, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  console.log("[DIAG loginAction totp] aal justo despues de verify:", aalAfter, "error:", aalError?.message);

  redirect("/admin");
}
