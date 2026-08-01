import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { supabase } from "@/lib/mia/supabaseClient";
import InviteForm from "./InviteForm";
import UserRow from "./UserRow";

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
          <UserRow
            key={u.id as string}
            user={{
              id: u.id as string,
              fullName: u.full_name as string,
              email: u.email as string,
              role: u.role as "admin" | "analista",
              isActive: u.is_active as boolean,
            }}
            isSelf={u.id === currentUser.id}
          />
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-zinc-700">Invitar nuevo usuario</h2>
      <InviteForm />
    </div>
  );
}
