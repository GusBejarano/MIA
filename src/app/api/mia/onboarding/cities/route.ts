import { NextRequest, NextResponse } from "next/server";
import { saveUserCities, removeUserCity } from "@/lib/mia/store";

// Agrega ciudades de interes del usuario (OnB-3 y "Mis conexiones") - fuera
// del flujo de turnos de chat, mismo patron que /api/mia/declare-relation.
type RequestBody = { userId: string; cities: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, cities } = body;

  if (!userId || !UUID_RE.test(userId) || !Array.isArray(cities) || cities.length === 0) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await saveUserCities(
      userId,
      cities.map((c) => c.trim()).filter(Boolean)
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/cities:", err);
    return NextResponse.json({ error: "No se pudieron guardar las ciudades" }, { status: 500 });
  }
}

type DeleteBody = { userId: string; city: string };

export async function DELETE(req: NextRequest) {
  let body: DeleteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, city } = body;
  if (!userId || !UUID_RE.test(userId) || !city?.trim()) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await removeUserCity(userId, city);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /api/mia/onboarding/cities:", err);
    return NextResponse.json({ error: "No se pudo quitar la ciudad" }, { status: 500 });
  }
}
