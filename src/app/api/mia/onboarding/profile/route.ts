import { NextRequest, NextResponse } from "next/server";
import {
  getUserConnections,
  getUserCities,
  getUserProfileDetails,
} from "@/lib/mia/store";
import { getProgramNamesByIds } from "@/lib/mia/discovery";
import { getUserMaturityLevel } from "@/lib/mia/maturity";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Todo lo que necesita el home nuevo para hidratarse: conexiones (con
// nombre de benefactor ya resuelto), ciudades de interes, datos de "Mi
// perfil" y nivel de madurez - una sola llamada al abrir la app en vez de
// varias sueltas.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    const [connections, cities, profile, maturityLevel] = await Promise.all([
      getUserConnections(userId),
      getUserCities(userId),
      getUserProfileDetails(userId),
      getUserMaturityLevel(userId),
    ]);

    const programNames = await getProgramNamesByIds(connections.map((c) => c.programId));
    const connectionsWithNames = connections.map((c) => ({
      ...c,
      programName: programNames.get(c.programId) ?? "",
    }));

    return NextResponse.json({
      connections: connectionsWithNames,
      cities,
      profile,
      maturityLevel,
    });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/profile:", err);
    return NextResponse.json({ error: "No se pudo consultar el perfil" }, { status: 500 });
  }
}
