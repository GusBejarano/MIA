import { supabase } from "@/lib/mia/supabaseClient";

export type AuditStatus = "auditado" | "sin_auditar";

export type BenefitAuditInfo = {
  status: AuditStatus;
  lastAuditedAt: string | null;
  /** Independiente de si ya se audito antes - si hoy no se cumple (ej.
   * presencial sin sedes), el boton debe deshabilitarse aunque nunca se
   * haya intentado auditar (ver audit_status, que confunde ambos casos
   * bajo "sin_auditar"). */
  meetsCondition: boolean;
};

/** Lee el estado derivado de public.benefit_audit_status (vista, nunca
 * un booleano guardado) - "sin_auditar" cubre tanto "nunca se audito"
 * como "se audito pero la condicion se rompio despues" (ej. se borro la
 * sede) - ver Admin v2.1, confirmado con Gustavo que el des-audit es
 * automatico y no requiere codigo aparte. */
export async function getAuditStatus(benefitId: string): Promise<BenefitAuditInfo> {
  const { data, error } = await supabase
    .from("benefit_audit_status")
    .select("audit_status, last_audited_at, meets_condition")
    .eq("benefit_id", benefitId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo consultar el estado de auditoría: ${error.message}`);
  return {
    status: (data?.audit_status as AuditStatus) ?? "sin_auditar",
    lastAuditedAt: (data?.last_audited_at as string) ?? null,
    meetsCondition: (data?.meets_condition as boolean) ?? false,
  };
}

/** Version bulk para el grid (una sola consulta por pantalla, no N). */
export async function getAuditStatusBulk(
  benefitIds: string[]
): Promise<Map<string, BenefitAuditInfo>> {
  if (benefitIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("benefit_audit_status")
    .select("benefit_id, audit_status, last_audited_at, meets_condition")
    .in("benefit_id", benefitIds);
  if (error) throw new Error(`No se pudo consultar el estado de auditoría: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [
      r.benefit_id as string,
      {
        status: r.audit_status as AuditStatus,
        lastAuditedAt: (r.last_audited_at as string) ?? null,
        meetsCondition: (r.meets_condition as boolean) ?? false,
      },
    ])
  );
}

/**
 * Inserta el registro de auditoria (nunca se borra - es la fuente de los
 * reportes de pago por analista) y, si vino de una tarea, revisa si esa
 * tarea ya quedo 100% auditada para archivarla sola a "historico". Un
 * solo lugar de escritura (el boton "Marcar como auditado") - no
 * justifica un trigger de Postgres para esto.
 */
export async function markBenefitAudited(
  benefitId: string,
  adminUserId: string,
  taskId?: string
): Promise<void> {
  const { error } = await supabase.from("benefit_audit_log").insert({
    benefit_id: benefitId,
    admin_user_id: adminUserId,
    task_id: taskId ?? null,
  });
  if (error) throw new Error(`No se pudo registrar la auditoría: ${error.message}`);

  if (taskId) {
    await closeTaskIfComplete(taskId);
  }
}

async function closeTaskIfComplete(taskId: string): Promise<void> {
  const { data: members, error: membersError } = await supabase
    .from("admin_task_benefits")
    .select("benefit_id")
    .eq("task_id", taskId);
  if (membersError) throw new Error(`No se pudo consultar la tarea: ${membersError.message}`);
  const benefitIds = (members ?? []).map((m) => m.benefit_id as string);
  if (benefitIds.length === 0) return;

  const statusByBenefit = await getAuditStatusBulk(benefitIds);
  const allAudited = benefitIds.every((id) => statusByBenefit.get(id)?.status === "auditado");
  if (!allAudited) return;

  const { error: updateError } = await supabase
    .from("admin_tasks")
    .update({ status: "historico", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "activa");
  if (updateError) throw new Error(`No se pudo archivar la tarea: ${updateError.message}`);
}
