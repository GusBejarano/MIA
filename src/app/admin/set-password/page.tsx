"use client";

import { useActionState } from "react";
import { setPasswordAction } from "./actions";

export default function SetPasswordPage() {
  const [state, formAction, pending] = useActionState(setPasswordAction, undefined);

  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-1 text-xl font-bold text-zinc-900">Define tu contraseña</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Este es tu primer ingreso al panel de administración de MIA.
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          placeholder="Contraseña (mínimo 8 caracteres)"
          required
          minLength={8}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          name="confirmPassword"
          placeholder="Repite la contraseña"
          required
          minLength={8}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Continuar"}
        </button>
      </form>
    </div>
  );
}
