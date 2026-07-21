import { NextRequest, NextResponse } from "next/server";
import { setRating } from "@/lib/mia/store";

// Unico punto de escritura de calificaciones - se llama al tocar una
// estrella en el detalle de un beneficio, fuera del flujo de turnos de
// chat (no genera respuesta de MIA ni avanza ninguna etapa).
type RequestBody = { userId: string; benefitId: string; rating: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, benefitId, rating } = body;

  if (!userId || !UUID_RE.test(userId) || !benefitId || !UUID_RE.test(benefitId)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  if (![0, 1, 2, 3].includes(rating)) {
    return NextResponse.json({ error: "Calificacion invalida" }, { status: 400 });
  }

  try {
    await setRating(userId, benefitId, rating);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/rating:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la calificacion" },
      { status: 500 }
    );
  }
}
