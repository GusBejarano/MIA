"use server";

import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import {
  listBenefitsForAdmin,
  getBenefitFull,
  updateBenefitAdmin,
  type AdminBenefitCard,
  type AdminBenefitFull,
  type AdminBenefitPatch,
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
