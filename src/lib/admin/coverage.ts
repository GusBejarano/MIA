// Logica pura (sin imports) para el consolidado "Ciudad(es)" calculado
// desde las sedes vinculadas (items C1/C2 de v2.3) - compartida entre
// EditPanel.tsx (caja de Datos) y SedesTab.tsx (caja de cobertura y orden
// de los grupos), para que ambos muestren exactamente el mismo calculo.

export type CoverageCity = { city: string; name: string; count: number };

/** Agrupa por ciudad y ordena de mayor a menor numero de sedes - empate
 * alfabetico por el nombre visible. `cities` trae una entrada por sede (sin
 * dedupe); `displayByCity` resuelve el nombre visible (city_regions.display_name). */
export function coverageFromCities(
  cities: string[],
  displayByCity: Record<string, string>
): CoverageCity[] {
  const counts = new Map<string, number>();
  for (const c of cities) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const nameA = displayByCity[a[0]] ?? a[0];
      const nameB = displayByCity[b[0]] ?? b[0];
      return nameA.localeCompare(nameB);
    })
    .map(([city, count]) => ({ city, name: displayByCity[city] ?? city, count }));
}

/** Texto para pantalla: "Cali (13) · Jamundí (2)". */
export function coverageSummaryText(coverage: CoverageCity[]): string {
  return coverage.map((c) => `${c.name} (${c.count})`).join(" · ");
}

/** Texto que guardaria benefits.city (lo hace el trigger real, Fase 6) -
 * usado solo para comparar contra lo guardado hoy y avisar la diferencia. */
export function coverageSavedText(coverage: CoverageCity[]): string {
  return coverage.map((c) => c.name).join(", ");
}

function normalizeCityPiece(piece: string): string {
  return piece
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Codigos de ciudad (city_regions.city) declarados hoy en benefits.city,
 * sin normalizar contra la lista real - solo texto libre partido por coma,
 * para comparar contra la cobertura calculada y avisar que cambiaria. */
export function parseDeclaredCities(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map(normalizeCityPiece)
    .filter((c) => c !== "" && c !== "colombia");
}
