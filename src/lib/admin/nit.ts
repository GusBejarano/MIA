// Logica pura (sin imports) para parsear/validar un NIT - compartida entre
// catalog.ts (updateMerchantNit, server) y el flujo "+ Nuevo Convenio"
// (cliente, item N2) para no duplicar la regla de formato/rango.

export type ParsedNit = { ok: true; nit: string; provisional: boolean } | { ok: false; error: string };

/**
 * Solo digitos, sin digito de verificacion (decision explicita: no se
 * calcula ni se valida). 9 o 10 digitos. "Provisional" = 10 digitos que
 * empiezan por 9999999 (rango de merchant_provisional_nit_seq,
 * 9999999000-9999999999) - nunca se deja guardar como NIT "real".
 */
export function parseNit(raw: string): ParsedNit {
  const nit = raw.replace(/\D/g, "");
  if (nit.length < 9 || nit.length > 10) {
    return { ok: false, error: "El NIT debe tener 9 o 10 dígitos." };
  }
  const provisional = nit.length === 10 && nit.startsWith("9999999");
  return { ok: true, nit, provisional };
}
