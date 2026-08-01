"use server";

import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { getBenefitLocations, type BenefitLocation } from "@/lib/mia/discovery";
import {
  listBenefitsForAdmin,
  getBenefitFull,
  updateBenefitAdmin,
  searchMerchants,
  createMerchantAndLink,
  linkExistingMerchant,
  createSedeFromLegacy,
  listMerchantLocations,
  toggleLocationLink,
  upsertLocation,
  deleteLocation,
  resolveMapsUrlLatLng,
  type AdminBenefitCard,
  type AdminBenefitFull,
  type AdminBenefitPatch,
  type MerchantSearchResult,
  type MerchantLocation,
  type LocationInput,
} from "@/lib/admin/catalog";

async function requireAdminUser() {
  const user = await getCurrentAdminUser();
  if (!user) throw new Error("No autenticado.");
  return user;
}

export async function loadBenefitsAction(
  programId: string,
  city: string
): Promise<AdminBenefitCard[]> {
  await requireAdminUser();
  return listBenefitsForAdmin(programId, city);
}

export async function loadBenefitFullAction(id: string): Promise<AdminBenefitFull | null> {
  await requireAdminUser();
  return getBenefitFull(id);
}

export async function saveBenefitAction(
  id: string,
  patch: AdminBenefitPatch
): Promise<AdminBenefitFull> {
  await requireAdminUser();
  return updateBenefitAdmin(id, patch);
}

/** Sedes reales de un beneficio en una ciudad - usada por el preview
 * "👁️ Usuario Final" del panel admin, para que muestre el mismo boton de
 * sedes (Ver sedes (N) / +N puntos) que vera un usuario real, en vez de
 * caer siempre al "Como llegar" legacy de una sola sede. */
export async function loadBenefitLocationsAction(
  benefitId: string,
  city: string
): Promise<BenefitLocation[]> {
  await requireAdminUser();
  return getBenefitLocations(benefitId, city);
}

// ============================================================
// Admin v2.0 - comercio compartido + sedes (pestaña "Sedes")
// ============================================================

export async function searchMerchantsAction(query: string): Promise<MerchantSearchResult[]> {
  await requireAdminUser();
  return searchMerchants(query);
}

export async function createMerchantAndLinkAction(
  benefitId: string,
  name: string
): Promise<string> {
  await requireAdminUser();
  return createMerchantAndLink(benefitId, name);
}

export async function linkExistingMerchantAction(
  benefitId: string,
  merchantId: string
): Promise<void> {
  await requireAdminUser();
  return linkExistingMerchant(benefitId, merchantId);
}

export async function createSedeFromLegacyAction(benefitId: string): Promise<void> {
  await requireAdminUser();
  return createSedeFromLegacy(benefitId);
}

export async function listMerchantLocationsAction(
  merchantId: string,
  city: string,
  benefitId: string
): Promise<MerchantLocation[]> {
  await requireAdminUser();
  return listMerchantLocations(merchantId, city, benefitId);
}

export async function toggleLocationLinkAction(
  benefitId: string,
  locationId: string,
  linked: boolean
): Promise<void> {
  await requireAdminUser();
  return toggleLocationLink(benefitId, locationId, linked);
}

export async function upsertLocationAction(input: LocationInput): Promise<string> {
  await requireAdminUser();
  return upsertLocation(input);
}

export async function deleteLocationAction(id: string): Promise<void> {
  await requireAdminUser();
  return deleteLocation(id);
}

export async function resolveMapsUrlLatLngAction(
  url: string
): Promise<{ lat: number | null; lng: number | null }> {
  await requireAdminUser();
  return resolveMapsUrlLatLng(url);
}
