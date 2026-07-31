"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(
    loginAction,
    undefined
  );
  const step = state?.step ?? "password";

  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-1 text-xl font-bold text-zinc-900">Panel de administración MIA</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {step === "password" ? "Ingresa con tu correo y contraseña." : "Escribe tu código de 2 pasos."}
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        {step === "password" ? (
          <>
            <input
              type="email"
              name="email"
              placeholder="Correo"
              required
              autoComplete="username"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              name="password"
              placeholder="Contraseña"
              required
              autoComplete="current-password"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </>
        ) : (
          <input
            type="text"
            name="code"
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            required
            maxLength={6}
            autoFocus
            className="rounded-lg border border-zinc-300 px-3 py-2 text-center text-lg tracking-widest"
          />
        )}
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Verificando..." : step === "password" ? "Continuar" : "Confirmar"}
        </button>
      </form>
    </div>
  );
}
