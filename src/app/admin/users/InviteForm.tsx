"use client";

import { useActionState } from "react";
import { inviteAdminUserAction } from "./actions";

export default function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteAdminUserAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4">
      <input
        type="text"
        name="fullName"
        placeholder="Nombre completo"
        required
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <input
        type="email"
        name="email"
        placeholder="Correo"
        required
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <select name="role" required className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
        <option value="analista">Analista</option>
        <option value="admin">Admin</option>
      </select>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Invitando..." : "Invitar"}
      </button>
    </form>
  );
}
