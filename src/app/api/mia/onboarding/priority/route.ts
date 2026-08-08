import { NextRequest, NextResponse } from "next/server";
import { saveConnectionPriority } from "@/lib/mia/store";

// Cambia la prioridad (1-3 estrellas) de un benefactor conectado, ver
// UserConnection.prioridad en store.ts - fuera del flujo de turnos de
// chat, mismo patron que /api/mia/declare-relation.
type RequestBody = { userId: string; programId: string; prioridad: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, programId, prioridad } = body;

  if (
    !userId ||
    !UUID_RE.test(userId) ||
    !programId ||
    !UUID_RE.test(programId) ||
    ![1, 2, 3].includes(prioridad)
  ) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await saveConnectionPriority(userId, programId, prioridad);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/priority:", err);
    return NextResponse.json({ error: "No se pudo guardar la prioridad" }, { status: 500 });
  }
}
