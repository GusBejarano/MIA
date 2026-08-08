/**
 * Nivel de madurez del beneficiario (Explorador -> Habitual -> Frecuente).
 * Unico punto del codigo que decide el nivel - hoy sin calculo real, siempre
 * "explorador" (ver prompt dev 2.5 "Cerca de ti"). Cuando exista el calculo
 * real (frecuencia de uso, ver analisis de flujos de navegacion), solo hay
 * que cambiar esta funcion - nada de lo que la consume deberia tocarse.
 */

export type MaturityLevel = "explorador" | "habitual" | "frecuente";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getUserMaturityLevel(userId: string): Promise<MaturityLevel> {
  return "explorador";
}
