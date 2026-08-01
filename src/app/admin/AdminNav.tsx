"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav({ role }: { role: "admin" | "analista" }) {
  const pathname = usePathname();

  // El analista nunca ve Catálogo/Usuarios (regla 11 de v2.1) - entra
  // directo a "Mis tareas", que ademas es su pagina de inicio (ver
  // redirect en src/app/admin/page.tsx).
  const links =
    role === "admin"
      ? [
          { href: "/admin", label: "Catálogo" },
          { href: "/admin/tasks", label: "Tareas" },
          { href: "/admin/users", label: "Usuarios" },
        ]
      : [{ href: "/admin/tasks", label: "Mis tareas" }];

  return (
    <nav className="flex gap-4 border-b border-zinc-200 bg-white px-4">
      {links.map((link) => {
        // "/admin" es la raiz - solo exacta, o su startsWith pisaria a
        // /admin/tasks y /admin/users (todas empiezan por "/admin/").
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`border-b-2 px-1 py-2 text-sm font-semibold ${
              active
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
