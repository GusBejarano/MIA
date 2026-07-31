import { redirect } from "next/navigation";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";
import LoginForm from "./LoginForm";

export default async function AdminLoginPage() {
  // Si ya hay una sesion completamente verificada (aal2 - password + TOTP),
  // no tiene sentido mostrar el formulario de login de nuevo - manda
  // directo al panel. OJO: no basta con "hay sesion" a secas, porque un
  // usuario a mitad del login (ya paso password, aal1, esperando el codigo
  // TOTP) tambien tiene sesion - por eso se exige aal2 especificamente, para
  // no romper ese segundo paso del flujo.
  const supabase = await createAdminAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    console.log("[DIAG /admin/login page] user:", user.id, "aal:", aal);
    if (aal?.currentLevel === "aal2") {
      redirect("/admin");
    }
  } else {
    console.log("[DIAG /admin/login page] no user");
  }

  return <LoginForm />;
}
