import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, saveProfileFieldValue, recordProfileFieldAnswered } from "@/lib/mia/store";

// Arranque del onboarding v2 (dev 2.5, OnB-1): identifica/crea al usuario
// por telefono y, si ya trae el nombre (a diferencia del phone-gate
// actual), lo guarda de una vez y lo saca de la rotacion de aprendizaje de
// perfil (parseProfileAnswer/selectPendingProfileField) - si no se hace
// esto, MIA volveria a preguntar el nombre despues como si nunca se
// hubiera dado. Fuera del flujo de turnos de chat, mismo patron que
// /api/mia/declare-relation.
type RequestBody = { phone: string; name?: string };

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  const name = body.name?.trim();

  if (!phone) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    const user = await getOrCreateUser(phone);
    if (name) {
      await saveProfileFieldValue(user.id, "name", name);
      await recordProfileFieldAnswered(user.id, "name");
    }
    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/start:", err);
    return NextResponse.json({ error: "No se pudo iniciar el onboarding" }, { status: 500 });
  }
}
