// Utilidades de geolocalizacion de navegador, client-side puras (sin
// imports de servidor - a diferencia de discovery.ts, este modulo si se
// puede importar desde un Client Component). Extraidas de MiaChat.tsx para
// reusarlas tambien desde DetailSheet.tsx (seccion de sedes, Fase 3 v2.0) -
// un solo lugar con el wrapper de geolocalizacion, no dos copias.

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocalizacion no soportada"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 60000,
    });
  });
}

/** Permiso ya concedido a nivel de navegador (Permissions API) - sin disparar el prompt nativo. */
export async function isGeolocationGranted(): Promise<boolean> {
  if (!("permissions" in navigator)) return false;
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/** Distancia en km entre dos puntos (formula haversine) - calculo determinístico en codigo, nunca estimado por el LLM. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nombre de ciudad a partir de lat/lng (BigDataCloud, gratis, sin API key) - extraida de MiaChat.tsx para reusarla desde ChatPanel.tsx. */
export async function reverseGeocodeCity(lat: number, lon: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.city || data.locality || undefined;
  } catch {
    return undefined;
  }
}
