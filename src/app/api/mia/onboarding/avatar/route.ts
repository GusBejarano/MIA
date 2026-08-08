import { NextRequest, NextResponse } from "next/server";
import { saveAvatar, type AvatarKey } from "@/lib/mia/store";

// Guarda el avatar elegido en "Mi perfil" - fuera del flujo de turnos de
// chat, mismo patron que /api/mia/declare-relation.
type RequestBody = { userId: string; avatar: AvatarKey };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_KEYS: AvatarKey[] = ["negro", "verde", "fucsia"];

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { userId, avatar } = body;

  if (!userId || !UUID_RE.test(userId) || !AVATAR_KEYS.includes(avatar)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    await saveAvatar(userId, avatar);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/avatar:", err);
    return NextResponse.json({ error: "No se pudo guardar el avatar" }, { status: 500 });
  }
}
