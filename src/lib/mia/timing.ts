const ENABLED = process.env.MIA_DEBUG_TIMING === "true";

/**
 * Mide cuanto tarda `fn` y lo loguea (Netlify captura console.log de las
 * funciones serverless) - instrumentacion temporal para diagnosticar la
 * demora justo despues de ingresar el numero de WhatsApp (v1.5, ver
 * notas-v1.5). Silencioso si MIA_DEBUG_TIMING no esta en "true", para no
 * ensuciar logs de produccion por defecto.
 */
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[mia:timing] ${label} ${(performance.now() - start).toFixed(0)}ms`);
  }
}
