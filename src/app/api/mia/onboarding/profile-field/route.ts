import { NextRequest, NextResponse } from "next/server";
import { saveProfileFieldValue, recordProfileFieldAnswered } from "@/lib/mia/store";

// Edicion manual de un campo de perfil desde "Mi perfil" (nombre, genero,
// fecha de nacimiento) - mismo mecanismo que la confirmacion reactiva del
// aprendizaje de perfil (parseProfileAnswer/resolveProfileConfirmation),
// pero disparado por el usuario desde el sheet en vez de una pregunta de
// MIA. Tambien lo saca de la rotacion (recordProfileFieldAnswered), igual
// que /api/mia/onboarding/start con el nombre - si no se hiciera esto, MIA
// podria volver a preguntar un campo que el usuario ya edito aqui.
type RequestBody = { userId: string; fieldKey: "name" | "gender" | "birth_date"; value: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_KEYS = ["name", "gender", "birth_date"];

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, fieldKey, value } = body;

  if (!userId || !UUID_RE.test(userId) || !FIELD_KEYS.includes(fieldKey) || !value?.trim()) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await saveProfileFieldValue(userId, fieldKey, value.trim());
    await recordProfileFieldAnswered(userId, fieldKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/profile-field:", err);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
