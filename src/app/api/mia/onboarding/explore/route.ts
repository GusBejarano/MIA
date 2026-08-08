import { NextRequest, NextResponse } from "next/server";
import { getUserConnections, getUserCities } from "@/lib/mia/store";
import { getAvailableCategories } from "@/lib/mia/discovery";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fila de categorias del filtro de "Mis Beneficios" (HomeTabs.tsx) - une
// todas las ciudades de interes del usuario, no solo la primera: si solo
// mirara la primera, un usuario con 2+ ciudades podia ver una fila de
// categorias mas corta de lo real (bug reportado: "el listado de
// categorias no es consecuente con los beneficios desplegados"). El
// listado de tarjetas por categoria puntual (getBenefitsForCategory) ya
// no se sirve por esta ruta - vivia aqui para el tab "Explorar", que se
// elimino (ajuste dev 2.5: navegar el catalogo completo por categoria, sin
// limite a los benefactores conectados, ya no existe en la app). Sigue
// viva en discovery.ts porque el chat de produccion la usa directo
// (showCarouselForCategory en onboarding.ts).
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");

  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    const [connections, cities] = await Promise.all([
      getUserConnections(userId),
      getUserCities(userId),
    ]);
    const programIds = connections.map((c) => c.programId);
    if (cities.length === 0) return NextResponse.json({ categories: [] });

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
