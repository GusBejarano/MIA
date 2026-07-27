import { NextResponse } from "next/server";

// Ruta liviana para el ping de "mantener despierta" la funcion serverless
// (ver netlify/functions/keep-warm.mts) - nunca toca Supabase ni Claude, no
// crea usuarios ni ningun otro dato. En Netlify, TODAS las rutas dinamicas
// de Next.js (API routes incluida) comparten una sola funcion serverless -
// pingear esta ruta cada pocos minutos evita el cold start real que se
// notaba en /api/mia despues de ~5 min sin trafico.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}
