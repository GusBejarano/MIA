import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { supabase } from "@/lib/mia/supabaseClient";
import InviteForm from "./InviteForm";

export default async function AdminUsersPage() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect("/admin/login");
  if (currentUser.role !== "admin") redirect("/admin");

  const { data: users } = await supabase
    .from("admin_users")
    .select("id, full_name, email, role, is_active, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-lg font-bold text-zinc-900">Usuarios del panel</h1>

      <div className="mb-6 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        {(users ?? []).map((u) => (
          <div key={u.id as string} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <div className="font-semibold text-zinc-900">{u.full_name as string}</div>
              <div className="text-zinc-500">{u.email as string}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                {u.role as string}
              </span>
              {!u.is_active && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  inactivo
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-zinc-700">Invitar nuevo usuario</h2>
      <InviteForm />
    </div>
  );
}
