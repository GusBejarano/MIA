import { NextRequest, NextResponse } from "next/server";
import { getUserConnections, getUserCities } from "@/lib/mia/store";
import { getConnectedBenefits, getNearbyConnectedBenefits } from "@/lib/mia/discovery";
import { getUserMaturityLevel } from "@/lib/mia/maturity";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Grid de beneficios de los tabs "Conectados" y "Cerca de ti" (OnB-4 / home
// de retorno) - ?tab=conectados o ?tab=cerca (con lat/lng cuando ya se
// concedio el permiso de ubicacion de ese tab).
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const tab = req.nextUrl.searchParams.get("tab");

  if (!userId || !UUID_RE.test(userId) || (tab !== "conectados" && tab !== "cerca")) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    const connections = await getUserConnections(userId);
    const programIds = connections.map((c) => c.programId);

    if (tab === "conectados") {
      const cities = await getUserCities(userId);
      const programPriorities = connections.map((c) => ({
        programId: c.programId,
        prioridad: c.prioridad,
      }));
      const cards = await getConnectedBenefits(programPriorities, cities, userId);
      return NextResponse.json({ cards });
    }

    const maturityLevel = await getUserMaturityLevel(userId);
    if (maturityLevel !== "explorador") {
      // Nivel Habitual+ (todavia sin forma de llegar ahi) tendria mapa en
      // vez de lista - por ahora no hay UI para ese caso, se deja el gate
      // construido segun la regla del prompt.
      return NextResponse.json({ cards: [], maturityLevel });
    }

    // Sin lat/lng aqui: el cliente ya tiene la posicion (la pidio para
    // mostrar el estado "granted" del tab) y ordena con haversineKm, mismo
    // patron que DetailSheet.tsx para las sedes de un beneficio puntual.
    const cards = await getNearbyConnectedBenefits(programIds, userId);
    return NextResponse.json({ cards, maturityLevel });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/benefits:", err);
    return NextResponse.json({ error: "No se pudieron consultar los beneficios" }, { status: 500 });
  }
}
