"use client";

import { useState, useTransition } from "react";
import { updateUserRoleAction, setUserActiveAction } from "./actions";

export type AdminUserRow = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "analista";
  isActive: boolean;
};

export default function UserRow({
  user,
  isSelf,
}: {
  user: AdminUserRow;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(role: "admin" | "analista") {
    setError(null);
    startTransition(async () => {
      try {
        await updateUserRoleAction(user.id, role);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar el rol.");
      }
    });
  }

  function handleToggleActive() {
    setError(null);
    startTransition(async () => {
      try {
        await setUserActiveAction(user.id, !user.isActive);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar el usuario.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-zinc-900">{user.fullName}</div>
          <div className="text-zinc-500">{user.email}</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={user.role}
            disabled={isSelf || pending}
            onChange={(e) => handleRoleChange(e.target.value as "admin" | "analista")}
            className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 disabled:opacity-50"
          >
            <option value="analista">analista</option>
            <option value="admin">admin</option>
          </select>
          {!user.isActive && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
              inactivo
            </span>
          )}
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={isSelf || pending}
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            title={isSelf ? "No puedes desactivar tu propia cuenta" : undefined}
          >
            {user.isActive ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
