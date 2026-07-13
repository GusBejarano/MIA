/**
 * El campo `city` en Supabase es texto libre y puede traer varias ciudades
 * separadas por coma (ej. "Cali, Palmira, Colombia"). Hace match si algun
 * pedazo TERMINA en la ciudad buscada (no si la contiene en cualquier
 * posicion) - eso evita que "Cali" matchee "Calima, Colombia". No evita
 * todos los falsos positivos (una ciudad como "Nueva Cali" matchearia
 * igual), pero es mas probable que varien los finales que los inicios.
 */
export function cityMatches(dbCity: string, userCity: string): boolean {
  const target = userCity.trim().toLowerCase();
  if (!target) return false;
  return dbCity
    .split(",")
    .map((piece) => piece.trim().toLowerCase())
    .some((piece) => piece.endsWith(target));
}
