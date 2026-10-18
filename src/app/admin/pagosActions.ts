"use server";

import { requireAdminRole } from "@/lib/admin/guards";
import {
  listPaymentRows,
  getPaymentTaskBenefits,
  type PaymentFilters,
  type PaymentRow,
  type PaymentBenefitDetail,
} from "@/lib/admin/payments";

// Pagos es una pantalla solo de admin (item P1 de v2.3) - el analista no la
// ve en el menu (AdminNav.tsx) ni puede invocar estas acciones directo.

export async function listPaymentRowsAction(filters: PaymentFilters): Promise<PaymentRow[]> {
  await requireAdminRole();
  return listPaymentRows(filters);
}

export async function getPaymentTaskBenefitsAction(taskId: string): Promise<PaymentBenefitDetail[]> {
  await requireAdminRole();
  return getPaymentTaskBenefits(taskId);
}
