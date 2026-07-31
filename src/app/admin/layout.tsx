import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { logoutAction } from "./actions";

// Layout propio de /admin, sin nada de la marca/nav de la app publica de
// MIA (regla de negocio: /admin es un producto completamente aparte). Las
// rutas del propio flujo de auth (login/set-password/mfa/enroll) no tienen
// todavia un admin_users resuelto - en ese caso se renderiza solo
// {children}, sin la barra superior.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentAdminUser();

  if (!currentUser) {
    return <div className="min-h-screen bg-zinc-50">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="text-sm">
          <span className="font-semibold text-zinc-900">{currentUser.fullName}</span>
          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
            {currentUser.role}
          </span>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
            Cerrar sesión
          </button>
        </form>
      </header>
      <main>{children}</main>
    </div>
  );
}
