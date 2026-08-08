import { NextResponse } from "next/server";
import { getAllPrograms, getAvailableCities } from "@/lib/mia/discovery";

// Datos de referencia para los pickers de OnB-2/OnB-3 y "Mis conexiones" -
// no dependen de un usuario puntual, cacheables por el navegador entre
// pasos del onboarding.
export async function GET() {
  try {
    const [programs, cities] = await Promise.all([getAllPrograms(), getAvailableCities()]);
    return NextResponse.json({ programs, cities });
  } catch (err) {
    console.error("Error en /api/mia/onboarding/catalog:", err);
    return NextResponse.json({ error: "No se pudo consultar el catalogo" }, { status: 500 });
  }
}
