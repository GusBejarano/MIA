"use server";

import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import {
  getAuditStatus,
  getAuditStatusBulk,
  markBenefitAudited,
  type BenefitAuditInfo,
} from "@/lib/admin/audit";

async function requireAdminUser() {
  const user = await getCurrentAdminUser();
  if (!user) throw new Error("No autenticado.");
  return user;
}

export async function getAuditStatusAction(benefitId: string): Promise<BenefitAuditInfo> {
  await requireAdminUser();
  return getAuditStatus(benefitId);
}

export async function getAuditStatusBulkAction(
  benefitIds: string[]
): Promise<Record<string, BenefitAuditInfo>> {
  await requireAdminUser();
  const map = await getAuditStatusBulk(benefitIds);
  return Object.fromEntries(map);
}

export async function markBenefitAuditedAction(benefitId: string, taskId?: string): Promise<void> {
  const user = await requireAdminUser();
  return markBenefitAudited(benefitId, user.id, taskId);
}
