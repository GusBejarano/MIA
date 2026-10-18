import type { DetailSheetMessage } from "@/lib/mia/uiMessages";
import type { AdminBenefitFull } from "@/lib/admin/catalog";
import type { BenefitLocation } from "@/lib/mia/discovery";

/** Arma el mismo mensaje que vería un beneficiario real, para el preview
 * "👁️ Usuario Final" (Catálogo y vista de tarea comparten este armado -
 * item F3 de v2.3, antes duplicado solo en CatalogExplorer.tsx). */
export function toPreviewMessage(b: AdminBenefitFull, sedes: BenefitLocation[]): DetailSheetMessage {
  const details: { label: string; value: string }[] = [];
  if (b.valid_until) details.push({ label: "Vigencia", value: `Hasta ${b.valid_until}` });
  if (b.address) details.push({ label: "Dirección", value: b.address });

  return {
    type: "detail_sheet",
    id: b.id,
    title: b.title,
    tag: (b.category ?? "").split(",")[0]?.trim() ?? "",
    description: b.conditions ?? "",
    photoUrl: b.image_url,
    details,
    links: { go: b.how_to_get_there, web: b.company_url, social: b.social_media_url },
    rating: 0,
    // Contexto de admin, no de un beneficiario real - hasRelation=true oculta
    // el boton de "declarar relacion" (no aplica aqui), y no se pasa userId
    // a DetailSheet, asi que ninguna accion de usuario final llega a persistir.
    relation: { programId: "", programName: "", hasRelation: true },
    redemptionInstructions: b.redemption_instructions,
    sedes,
    // Sin userId real detras de este preview - nunca hay un permiso
    // persistido que consultar, asi que siempre arranca pidiendolo (igual
    // que la primera vez que lo veria un usuario real).
    locationPermissionGranted: false,
  };
}
