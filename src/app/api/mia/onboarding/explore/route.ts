import { NextRequest, NextResponse } from "next/server";
import { getUserConnections, getUserCities } from "@/lib/mia/store";
import { getAvailableCategories, getBenefitsForCategory } from "@/lib/mia/discovery";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tab "Explorar": catalogo por categoria de los benefactores conectados.
// El listado de tarjetas por categoria puntual (getBenefitsForCategory,
// compartido con el carrusel del chat de produccion) sigue acotado a la
// primera ciudad de interes - simplificacion deliberada, esa funcion solo
// acepta una ciudad. Pero el listado de CATEGORIAS (para la fila de filtro
// compartida en HomeTabs.tsx) sí une todas las ciudades de interes - si
// solo mirara la primera, un usuario con 2+ ciudades podia ver una fila de
// categorias mas corta de lo real (bug reportado: "el listado de
// categorias no es consecuente con los beneficios desplegados"). El filtro
// que deja una conversacion con MIA (chip removible) se resuelve en el
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
    if (cities.length === 0) return NextResponse.json({ categories: [], cards: [] });

    if (categoryValue && categoryLabel) {
      const cards = await getBenefitsForCategory(programIds, categoryValue, categoryLabel, cities[0]);
      return NextResponse.json({ cards });
    }

    const categoriesByCity = await Promise.all(
      cities.map((city) => getAvailableCategories(programIds, city))
    );
    const categoryByValue = new Map(
      categoriesByCity.flat().map((c) => [c.value, c])
    );
    const categories = [...categoryByValue.values()];
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/explore:", err);
    return NextResponse.json({ error: "No se pudo consultar el catalogo" }, { status: 500 });
  }
}
