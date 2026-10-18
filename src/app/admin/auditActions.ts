"use server";

import { requireAdminRole, requireBenefitAccess } from "@/lib/admin/guards";
import {
  getAuditStatus,
  getAuditStatusBulk,
  markBenefitAudited,
  type BenefitAuditInfo,
} from "@/lib/admin/audit";

export async function getAuditStatusAction(benefitId: string): Promise<BenefitAuditInfo> {
  await requireBenefitAccess(benefitId);
  return getAuditStatus(benefitId);
}

/** Version bulk del grid del Catalogo, que es una pantalla solo de admin - la cola
 * del analista no pasa por aqui: su estado de auditoria lo arma getTaskDetail en el
 * servidor, ya acotado a los beneficios de su tarea (ver src/lib/admin/tasks.ts). */
export async function getAuditStatusBulkAction(
  benefitIds: string[]
): Promise<Record<string, BenefitAuditInfo>> {
  await requireAdminRole();
  const map = await getAuditStatusBulk(benefitIds);
  return Object.fromEntries(map);
}

export async function markBenefitAuditedAction(benefitId: string, taskId?: string): Promise<void> {
  const user = await requireBenefitAccess(benefitId);
  return markBenefitAudited(benefitId, user.id, taskId);
}
