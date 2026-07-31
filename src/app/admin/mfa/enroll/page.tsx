import { redirect } from "next/navigation";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";
import EnrollForm from "./EnrollForm";

export default async function MfaEnrollPage() {
  const supabase = await createAdminAuthServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((f) => f.status === "verified")) {
    redirect("/admin");
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) {
    return (
      <div className="mx-auto mt-24 max-w-sm px-4 text-sm text-red-600">
        No se pudo generar el código QR: {error?.message}
      </div>
    );
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-1 text-xl font-bold text-zinc-900">Activa la verificación en dos pasos</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Escanea este código con Google Authenticator, Authy o similar, y escribe el código de 6
        dígitos que te muestre.
      </p>
      <EnrollForm factorId={data.id} qrSvg={data.totp.qr_code} />
    </div>
  );
}
