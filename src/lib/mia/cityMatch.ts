/**
 * El campo `city` en Supabase es texto libre y puede traer varias ciudades
 * separadas por coma (ej. "Cali, Palmira, Colombia"). Hace match si algun
 * pedazo CONTIENE la ciudad buscada, en cualquier posicion (insensible a
 * mayusculas) - equivalente a `ILIKE '%texto%'`. "Cali" matcheando
 * "Calima, Colombia" es un resultado esperado, no un falso positivo a
 * evitar (decision explicita, revisada en julio 2026 - version anterior
 * usaba "termina en" para excluir justo ese caso).
 */
export function cityMatches(dbCity: string, userCity: string): boolean {
  const target = userCity.trim().toLowerCase();
  if (!target) return false;
  return dbCity
    .split(",")
    .map((piece) => piece.trim().toLowerCase())
    .some((piece) => piece.includes(target));
}
