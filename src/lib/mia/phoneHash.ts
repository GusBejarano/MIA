import crypto from "node:crypto";

// Normaliza a solo digitos (conservando un "+" inicial si viene con
// codigo de pais) para que el mismo numero siempre hashee igual sin
// importar como venga formateado (espacios, guiones, parentesis).
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/**
 * Hashea un numero de telefono con el salt compartido a nivel BEDI
 * (BEDI_HASH_SALT). Nunca se guarda el numero en texto plano - solo
 * este hash, en users.phone_hash.
 */
export function hashPhone(phone: string): string {
  const salt = process.env.BEDI_HASH_SALT;
  if (!salt) {
    throw new Error(
      "Falta BEDI_HASH_SALT. Copia .env.local.example a .env.local y pega el salt compartido a nivel BEDI."
    );
  }

  return crypto
    .createHmac("sha256", salt)
    .update(normalizePhone(phone))
    .digest("hex");
}
