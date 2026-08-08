import { NextRequest, NextResponse } from "next/server";
import { getUserConnections, getUserCities } from "@/lib/mia/store";
import { getAvailableCategories, getBenefitsForCategory } from "@/lib/mia/discovery";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tab "Explorar": catalogo por categoria de los benefactores conectados,
// acotado a la primera ciudad de interes del usuario (simplificacion
// deliberada - user_cities puede tener varias, getAvailableCategories/
// getBenefitsForCategory ya existentes solo aceptan una). El filtro que
// deja una conversacion con MIA (chip removible) se resuelve en el
// cliente con los resultados que ya trae esa respuesta del chat, no aqui.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const categoryValue = req.nextUrl.searchParams.get("categoryValue");
  const categoryLabel = req.nextUrl.searchParams.get("categoryLabel");

  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    const [connections, cities] = await Promise.all([
      getUserConnections(userId),
      getUserCities(userId),
    ]);
    const programIds = connections.map((c) => c.programId);
    const city = cities[0];
    if (!city) return NextResponse.json({ categories: [], cards: [] });

    if (categoryValue && categoryLabel) {
      const cards = await getBenefitsForCategory(programIds, categoryValue, categoryLabel, city);
      return NextResponse.json({ cards });
    }

    const categories = await getAvailableCategories(programIds, city);
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/explore:", err);
    return NextResponse.json({ error: "No se pudo consultar el catalogo" }, { status: 500 });
  }
}
