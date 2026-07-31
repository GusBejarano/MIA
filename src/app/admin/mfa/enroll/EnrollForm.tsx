"use client";

import { useActionState } from "react";
import { verifyEnrollAction } from "./actions";

export default function EnrollForm({ factorId, qrSvg }: { factorId: string; qrSvg: string }) {
  const [state, formAction, pending] = useActionState(verifyEnrollAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, no un archivo que next/image pueda optimizar */}
      <img src={qrSvg} alt="Código QR de verificación en dos pasos" className="mx-auto h-48 w-48" />
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
