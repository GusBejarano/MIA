import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";

// Placeholder de la Fase 1 - la navegacion Ciudad -> Benefactor -> grid
// (Fase 2) reemplaza este contenido, no esta pantalla en si.
export default async function AdminDashboardPage() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect("/admin/login");

  return (
    <div className="p-6">
      <h1 className="text-lg font-bold text-zinc-900">
        Bienvenido, {currentUser.fullName.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Fase 1 (auth + 2FA) lista. La navegación Ciudad → Benefactor va en la Fase 2.
      </p>
    </div>
  );
}
