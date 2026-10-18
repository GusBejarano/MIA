// Logica pura, sin ningun import - a proposito, para poder usarse tanto
// desde codigo de servidor (catalog.ts, que importa el cliente
// service_role y por eso no se puede importar desde un "use client") como
// desde componentes de cliente (SedesTab.tsx). Antes vivia duplicada en
// los dos sitios (item B2 de v2.3).

/** Extrae lat/lng de un link largo de Google Maps (patron "@lat,lng,zoom") -
 * parseo simple de URL, no geocodificacion paga (decision ya tomada en
 * v2.0). Links cortos (maps.app.goo.gl) o de busqueda por texto no traen
 * coordenadas - devuelve null en ese caso, se completan a mano despues. */
export function extractLatLngFromMapsUrl(url: string): { lat: number | null; lng: number | null } {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return { lat: null, lng: null };
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}
