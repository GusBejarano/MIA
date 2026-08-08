import { NextRequest, NextResponse } from "next/server";
import { saveUserConnection, type RelationType } from "@/lib/mia/store";

// Conecta un benefactor con tipo de relacion (OnB-2 y "Mis conexiones") -
// fuera del flujo de turnos de chat, mismo patron que /api/mia/declare-relation.
type RequestBody = {
  userId: string;
  programId: string;
  tipoRelacion: RelationType;
  esPrincipal: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATION_TYPES: RelationType[] = ["afiliado", "empleado", "beneficiario", "estudiante"];

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, programId, tipoRelacion, esPrincipal } = body;

  if (
    !userId ||
    !UUID_RE.test(userId) ||
    !programId ||
    !UUID_RE.test(programId) ||
    !RELATION_TYPES.includes(tipoRelacion)
  ) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await saveUserConnection(userId, programId, tipoRelacion, Boolean(esPrincipal));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/connect:", err);
    return NextResponse.json({ error: "No se pudo guardar la conexion" }, { status: 500 });
  }
}
