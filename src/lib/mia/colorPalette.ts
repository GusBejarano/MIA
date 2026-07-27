// Paleta de acentos de marca (violeta/cian + acentos) para asignar color de
// forma deterministica a partir de un string - compartida entre discovery.ts
// (color de benefactor/programa, por id, server-side) y BenefitThumbnail.tsx
// (color de fallback sin foto, por titulo, client-side). Vive en su propio
// modulo sin imports porque discovery.ts no se puede importar desde
// componentes de cliente (trae supabaseClient.ts, server-only).
export const BRAND_ACCENT_PALETTE = [
  "#6C4CF1",
  "#22D3EE",
  "#9B6CF0",
  "#4C7DFB",
  "#3EB6C4",
  "#F59E0B",
  "#EC4899",
  "#10B981",
];

export function colorForString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return BRAND_ACCENT_PALETTE[hash % BRAND_ACCENT_PALETTE.length];
}
