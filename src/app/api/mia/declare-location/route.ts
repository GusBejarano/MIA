import { NextRequest, NextResponse } from "next/server";
import { saveUserLocation, saveLocationPermission } from "@/lib/mia/store";

// Punto de escritura de "autorizar ubicacion" desde la seccion de sedes del
// detalle de un beneficio (Fase 3, v2.0) - fuera del flujo de turnos de
// chat (no genera respuesta de MIA), mismo patron que /api/mia/rating y
// /api/mia/declare-relation. saveUserLocation/saveLocationPermission ya
// existen (mismo mecanismo que la captura de ubicacion en el onboarding) -
// no se crea ningun campo/flujo de autorizacion nuevo.
type RequestBody = { userId: string; lat: number; lng: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, lat, lng } = body;

  if (!userId || !UUID_RE.test(userId) || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await Promise.all([saveUserLocation(userId, lat, lng), saveLocationPermission(userId)]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/declare-location:", err);
    return NextResponse.json(
      { error: "No se pudo guardar la ubicacion" },
      { status: 500 }
    );
  }
}
