"use client";

import { useActionState } from "react";
import { verifyEnrollAction } from "./actions";

export default function EnrollForm({ factorId, qrSvg }: { factorId: string; qrSvg: string }) {
  const [state, formAction, pending] = useActionState(verifyEnrollAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div
        className="mx-auto h-48 w-48"
        // Supabase devuelve el QR como SVG ya armado (auth.mfa.enroll) - no
        // hay forma de renderizarlo sin dangerouslySetInnerHTML, el
        // contenido viene de nuestro propio backend de Supabase, no de
        // input de usuario.
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <input type="hidden" name="factorId" value={factorId} />
      <input
        type="text"
        name="code"
        inputMode="numeric"
        placeholder="Código de 6 dígitos"
        required
        maxLength={6}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-center text-lg tracking-widest"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Verificando..." : "Confirmar"}
      </button>
    </form>
  );
}
