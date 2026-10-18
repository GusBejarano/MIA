import { supabase } from "@/lib/mia/supabaseClient";
import { getAuditStatusBulk } from "./audit";

// Admin v2.3, item P1 - reporte de pago por analista (benefit_audit_log ya
// se documentaba como "fuente de los reportes de pago", pero nada lo leia
// todavia). Una fila por tarea, no por analista: una tarea es la unidad que
// ya existe para agrupar auditorias (admin_task_benefits), y un analista
// puede tener varias.

export type PaymentFilters = {
  /** admin_users.id del analista, o undefined/"" = todos. */
  analystId?: string;
  /** Fecha ISO (yyyy-mm-dd), inclusive, en America/Bogota. */
  from?: string;
  /** Fecha ISO (yyyy-mm-dd), inclusive, en America/Bogota. */
  to?: string;
};

export type PaymentRow = {
  taskId: string;
  analystId: string;
  analystName: string;
  programName: string;
  city: string;
  category: string | null;
  assignedAt: string;
  /** Ultima auditoria de la tarea, sin acotar al rango del filtro (es un
   * dato de la tarea, no de la ventana de pago que se esta consultando). */
  lastAuditedAt: string | null;
  totalCount: number;
  /** Beneficios distintos de la tarea auditados dentro del rango pedido
   * (todos, si no hay rango). */
  auditedInRange: number;
  /** Beneficios que siguen sin auditar HOY (estado real, vista
   * benefit_audit_status) - independiente del rango. */
  pendingToday: number;
  /** auditedInRange / totalCount, 0-100. */
  compliancePct: number;
};

export type PaymentAnalystOption = { id: string; fullName: string };

export type PaymentBenefitDetail = {
  benefitId: string;
  title: string;
  /** Ultima auditoria de este beneficio EN ESTA TAREA (benefit_audit_log
   * puede tener mas de una fila si se des-audito y se volvio a auditar). */
  auditedAt: string | null;
};

function isoDay(value: string): string {
  return value.slice(0, 10);
}

function inRange(auditedAt: string, from?: string, to?: string): boolean {
  const day = isoDay(auditedAt);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * Una fila por tarea. "Auditados"/"% de cumplimiento" se acotan al rango
 * (si viene); "Por auditar" es el estado real de hoy (benefit_audit_status,
 * que se des-audita solo si se rompe la condicion despues); "Fin" es la
 * ultima auditoria de la tarea sin acotar. Con rango activo, se excluyen
 * las tareas sin ninguna auditoria dentro de el.
 */
export async function listPaymentRows(filters: PaymentFilters): Promise<PaymentRow[]> {
  const { data: tasks, error } = await supabase
    .from("admin_tasks")
    .select("id, assigned_to, program_id, city, category, assigned_at")
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(`No se pudieron consultar las tareas: ${error.message}`);

  let taskRows = tasks ?? [];
  if (filters.analystId) {
    taskRows = taskRows.filter((t) => t.assigned_to === filters.analystId);
  }
  if (taskRows.length === 0) return [];

  const taskIds = taskRows.map((t) => t.id as string);
  const userIds = [...new Set(taskRows.map((t) => t.assigned_to as string))];
  const programIds = [...new Set(taskRows.map((t) => t.program_id as string))];

  const [{ data: users }, { data: programs }, { data: members }, { data: auditRows }] =
    await Promise.all([
      supabase.from("admin_users").select("id, full_name").in("id", userIds),
      supabase.from("programs").select("id, name").in("id", programIds),
      supabase.from("admin_task_benefits").select("task_id, benefit_id").in("task_id", taskIds),
      supabase.from("benefit_audit_log").select("task_id, benefit_id, audited_at").in("task_id", taskIds),
    ]);
  if (!members) throw new Error("No se pudieron consultar los beneficios de las tareas.");

  const nameById = new Map((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  const programNameById = new Map((programs ?? []).map((p) => [p.id as string, p.name as string]));

  const membersByTask = new Map<string, string[]>();
  for (const m of members) {
    const tId = m.task_id as string;
    if (!membersByTask.has(tId)) membersByTask.set(tId, []);
    membersByTask.get(tId)!.push(m.benefit_id as string);
  }

  const auditRowsByTask = new Map<string, { benefitId: string; auditedAt: string }[]>();
  for (const r of auditRows ?? []) {
    const tId = r.task_id as string;
    if (!auditRowsByTask.has(tId)) auditRowsByTask.set(tId, []);
    auditRowsByTask
      .get(tId)!
      .push({ benefitId: r.benefit_id as string, auditedAt: r.audited_at as string });
  }

  // Estado real de hoy, una sola consulta para todos los beneficios de
  // todas las tareas (no N) - la misma vista que usa el resto del admin.
  const allBenefitIds = [...new Set(members.map((m) => m.benefit_id as string))];
  const statusByBenefit = await getAuditStatusBulk(allBenefitIds);

  const hasRange = Boolean(filters.from || filters.to);

  const rows: PaymentRow[] = taskRows.map((t) => {
    const taskId = t.id as string;
    const benefitIds = membersByTask.get(taskId) ?? [];
    const totalCount = benefitIds.length;
    const pendingToday = benefitIds.filter(
      (id) => statusByBenefit.get(id)?.status !== "auditado"
    ).length;

    const taskAuditRows = auditRowsByTask.get(taskId) ?? [];
    const lastAuditedAt =
      taskAuditRows.length > 0
        ? taskAuditRows.reduce((max, r) => (r.auditedAt > max ? r.auditedAt : max), taskAuditRows[0].auditedAt)
        : null;

    const inRangeRows = taskAuditRows.filter((r) => inRange(r.auditedAt, filters.from, filters.to));
    const auditedInRange = new Set(inRangeRows.map((r) => r.benefitId)).size;

    return {
      taskId,
      analystId: t.assigned_to as string,
      analystName: nameById.get(t.assigned_to as string) ?? "",
      programName: programNameById.get(t.program_id as string) ?? "",
      city: t.city as string,
      category: (t.category as string) ?? null,
      assignedAt: t.assigned_at as string,
      lastAuditedAt,
      totalCount,
      auditedInRange,
      pendingToday,
      compliancePct: totalCount > 0 ? (auditedInRange / totalCount) * 100 : 0,
    };
  });

  return hasRange ? rows.filter((r) => r.auditedInRange > 0) : rows;
}

/** Detalle de una tarea para la fila desplegable: cada beneficio con su
 * ultima auditoria EN ESA TAREA, o "por auditar" si nunca se audito ahi. */
export async function getPaymentTaskBenefits(taskId: string): Promise<PaymentBenefitDetail[]> {
  const { data: members, error } = await supabase
    .from("admin_task_benefits")
    .select("benefit_id")
    .eq("task_id", taskId);
  if (error) throw new Error(`No se pudieron consultar los beneficios de la tarea: ${error.message}`);
  const benefitIds = (members ?? []).map((m) => m.benefit_id as string);
  if (benefitIds.length === 0) return [];

  const [{ data: benefits }, { data: auditRows }] = await Promise.all([
    supabase.from("benefits").select("id, title").in("id", benefitIds),
    supabase.from("benefit_audit_log").select("benefit_id, audited_at").eq("task_id", taskId),
  ]);

  const lastByBenefit = new Map<string, string>();
  for (const r of auditRows ?? []) {
    const id = r.benefit_id as string;
    const cur = lastByBenefit.get(id);
    const auditedAt = r.audited_at as string;
    if (!cur || auditedAt > cur) lastByBenefit.set(id, auditedAt);
  }

  return (benefits ?? [])
    .map((b) => ({
      benefitId: b.id as string,
      title: b.title as string,
      auditedAt: lastByBenefit.get(b.id as string) ?? null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
