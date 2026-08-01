import Image from "next/image";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { logoutAction } from "./actions";
import AdminNav from "./AdminNav";

// Mismo mecanismo de metadatos de build que MiaChat.tsx (ver next.config.ts)
// - se repite aqui en vez de importarlo porque ese archivo es "use client"
// y este layout es un Server Component.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_HASH = process.env.NEXT_PUBLIC_BUILD_HASH ?? "local";
const ENV_PREFIX = process.env.NEXT_PUBLIC_ENV_PREFIX ?? "dev-";
const VERSION_LABEL = `v${APP_VERSION} · ${ENV_PREFIX}${BUILD_HASH}`;

// Layout propio de /admin, sin nav/menu compartido con la app publica de
// MIA (regla de negocio: /admin es un producto completamente aparte) -
// pero SI lleva el logo + "ADMIN" para que quede claro a simple vista en
// que contexto esta parado un admin/analista (nunca se confunde con la
// app de un usuario final). Las rutas del propio flujo de auth
// (login/set-password/mfa/enroll) no tienen todavia un admin_users
// resuelto - en ese caso se renderiza solo {children}, sin la barra superior.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentAdminUser();

  if (!currentUser) {
    return <div className="min-h-screen bg-zinc-50">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Image
            src="/logo/mia-icon.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <div className="leading-tight">
            <div className="flex items-baseline gap-1.5">
              <span className="mia-gradient-text text-base font-bold">mia</span>
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Admin
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">MIA by Descuentos Inteligentes</p>
            <p className="text-[10px] text-zinc-300">{VERSION_LABEL}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </header>
      <AdminNav role={currentUser.role} />
      <main>{children}</main>
    </div>
  );
}
