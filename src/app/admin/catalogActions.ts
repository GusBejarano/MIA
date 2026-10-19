"use server";

import {
  requireAdminRole,
  requireAnyTaskAccess,
  requireBenefitAccess,
  requireLocationAccess,
  requireMerchantAccess,
} from "@/lib/admin/guards";
import { getBenefitLocations, type BenefitLocation } from "@/lib/mia/discovery";
import {
  listAllCities,
  listBenefitsForAdmin,
  getBenefitFull,
  updateBenefitAdmin,
  searchMerchants,
  createMerchantAndLink,
  linkExistingMerchant,
  createSedeFromLegacy,
  listMerchantLocations,
  getLinkedLocationCities,
  getMerchantInfo,
  toggleLocationLink,
  upsertLocation,
  deleteLocation,
  resolveMapsUrlLatLng,
  type AdminCityOption,
  type AdminBenefitCard,
  type AdminBenefitFull,
  type AdminBenefitPatch,
  type MerchantSearchResult,
  type MerchantLocation,
  type LocationInput,
  type MerchantInfo,
} from "@/lib/admin/catalog";

// Guards por accion (Admin v2.3, item S1 - antes todas pedian solo sesion
// activa, no rol). La matriz completa esta en docs/ADMIN.md:
//   - requireAdminRole      -> listado completo del catalogo
//   - requireBenefitAccess  -> acciones sobre UN beneficio concreto
//   - requireMerchantAccess -> acciones que solo traen merchantId
//   - requireLocationAccess -> acciones que solo traen locationId
//   - requireAnyTaskAccess  -> acciones sin entidad propia que resolver

/** Catalogo completo de un benefactor en una ciudad - solo admin (el analista entra por "Mis tareas"). */
export async function loadBenefitsAction(
  programId: string,
  city: string
): Promise<AdminBenefitCard[]> {
  await requireAdminRole();
  return listBenefitsForAdmin(programId, city);
}

export async function loadBenefitFullAction(id: string): Promise<AdminBenefitFull | null> {
  await requireBenefitAccess(id);
  return getBenefitFull(id);
}

export async function saveBenefitAction(
  id: string,
  patch: AdminBenefitPatch
): Promise<AdminBenefitFull> {
  await requireBenefitAccess(id);
  return updateBenefitAdmin(id, patch);
}

/** Sedes reales de un beneficio - usada por el preview "👁️ Usuario Final" del panel admin,
 * para que muestre el mismo boton de sedes (Ver sedes (N) / +N puntos) que vera un usuario
 * real, en vez de caer siempre al "Como llegar" legacy de una sola sede. */
export async function loadBenefitLocationsAction(benefitId: string): Promise<BenefitLocation[]> {
  await requireBenefitAccess(benefitId);
  return getBenefitLocations(benefitId);
}

// ============================================================
// Admin v2.0 - comercio compartido + sedes (pestaña "Sedes")
// ============================================================

export async function searchMerchantsAction(query: string): Promise<MerchantSearchResult[]> {
  await requireAnyTaskAccess();
  return searchMerchants(query);
}

export async function createMerchantAndLinkAction(
  benefitId: string,
  name: string
): Promise<string> {
  await requireBenefitAccess(benefitId);
  return createMerchantAndLink(benefitId, name);
}

export async function linkExistingMerchantAction(
  benefitId: string,
  merchantId: string
): Promise<void> {
  await requireBenefitAccess(benefitId);
  return linkExistingMerchant(benefitId, merchantId);
}

export async function createSedeFromLegacyAction(benefitId: string): Promise<void> {
  await requireBenefitAccess(benefitId);
  return createSedeFromLegacy(benefitId);
}

export async function listMerchantLocationsAction(
  merchantId: string,
  benefitId: string
): Promise<MerchantLocation[]> {
  await requireBenefitAccess(benefitId);
  return listMerchantLocations(merchantId, benefitId);
}

/** Ciudades de las sedes vinculadas a este beneficio - fuente del
 * consolidado "Ciudad(es)" calculado (item C2). */
export async function getLinkedLocationCitiesAction(benefitId: string): Promise<string[]> {
  await requireBenefitAccess(benefitId);
  return getLinkedLocationCities(benefitId);
}

/** Nombre/NIT del comercio vinculado - encabezado "Comercio · NIT" de la
 * pestaña Sedes (N4) y el bloque "Comercio" de Datos (N3). */
export async function getMerchantInfoAction(
  merchantId: string,
  benefitId: string
): Promise<MerchantInfo | null> {
  await requireBenefitAccess(benefitId);
  return getMerchantInfo(merchantId);
}

/** Todas las ciudades de city_regions (desplegable del formulario de sede,
 * item C3, y nombres visibles para agrupar/consolidar en C1/C2) - sin
 * entidad propia que resolver, se exige al menos trabajo asignado. */
export async function listAllCitiesAction(): Promise<AdminCityOption[]> {
  await requireAnyTaskAccess();
  return listAllCities();
}

export async function toggleLocationLinkAction(
  benefitId: string,
  locationId: string,
  linked: boolean
): Promise<void> {
  await requireBenefitAccess(benefitId);
  return toggleLocationLink(benefitId, locationId, linked);
}

export async function upsertLocationAction(input: LocationInput): Promise<string> {
  await requireMerchantAccess(input.merchantId);
  return upsertLocation(input);
}

export async function deleteLocationAction(id: string): Promise<void> {
  await requireLocationAccess(id);
  return deleteLocation(id);
}

/** Resuelve un link corto de Maps siguiendo la redireccion (fetch desde el servidor):
 * sin entidad propia que validar, se exige al menos trabajo asignado. */
export async function resolveMapsUrlLatLngAction(
  url: string
): Promise<{ lat: number | null; lng: number | null }> {
  await requireAnyTaskAccess();
  return resolveMapsUrlLatLng(url);
}
