import { NextRequest, NextResponse } from "next/server";
import { saveProgramSelections } from "@/lib/mia/store";

// Unico punto de escritura de "declarar relacion" desde el detalle de un
// beneficio llegado por el buscador de negocio - fuera del flujo de turnos
// de chat (no genera respuesta de MIA ni avanza ninguna etapa), mismo
// patron que /api/mia/rating.
type RequestBody = { userId: string; programId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, programId } = body;

  if (!userId || !UUID_RE.test(userId) || !programId || !UUID_RE.test(programId)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await saveProgramSelections(userId, [programId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/declare-relation:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la relacion" },
      { status: 500 }
    );
  }
}
