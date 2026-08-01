import { supabase } from "@/lib/mia/supabaseClient";
import { listBenefitsForAdmin, estimateSiteBucket, type AdminBenefitCard } from "./catalog";
import { getAuditStatusBulk, type AuditStatus } from "./audit";

export type TaskStatus = "activa" | "historico";

export type AdminTaskSummary = {
  id: string;
  assignedToId: string;
  assignedToName: string;
  createdById: string;
  programId: string;
  programName: string;
  city: string;
  category: string | null;
  status: TaskStatus;
  assignedAt: string;
  completedAt: string | null;
  totalCount: number;
  auditedCount: number;
};

export type TaskDetail = AdminTaskSummary & {
  benefits: (AdminBenefitCard & { auditStatus: AuditStatus })[];
};

function firstCategory(category: string | null): string {
  return category?.split(",")[0]?.trim() ?? "";
}

/**
 * Snapshot al crear (regla 8/9 del diseno de v2.1): resuelve el alcance
 * con listBenefitsForAdmin (misma consulta que ya usa el catalogo),
 * filtra por categoria si vino, y solo mete a la cola los que estan
 * "sin_auditar" en ese momento - un beneficio nuevo que aparezca despues
 * en ese alcance no se suma solo a esta tarea.
 */
export async function createTask(
  programId: string,
  city: string,
  category: string | null,
  assignedTo: string,
  createdBy: string
): Promise<string> {
  const scoped = await listBenefitsForAdmin(programId, city);
  const filtered = scoped.filter((b) => !category || firstCategory(b.category) === category);
  const benefitIds = filtered.map((b) => b.id);

  const auditStatusByBenefit = await getAuditStatusBulk(benefitIds);
  const pendingIds = benefitIds.filter((id) => auditStatusByBenefit.get(id)?.status !== "auditado");

  const { data: task, error } = await supabase
    .from("admin_tasks")
    .insert({ assigned_to: assignedTo, created_by: createdBy, program_id: programId, city, category })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear la tarea: ${error.message}`);
  const taskId = task.id as string;

  if (pendingIds.length > 0) {
    const { error: linkError } = await supabase
      .from("admin_task_benefits")
      .insert(pendingIds.map((benefitId) => ({ task_id: taskId, benefit_id: benefitId })));
    if (linkError) {
      throw new Error(`No se pudo asignar los beneficios a la tarea: ${linkError.message}`);
    }
  }

  return taskId;
}

async function loadTaskSummaries(filterAssignedTo?: string): Promise<AdminTaskSummary[]> {
  let query = supabase
    .from("admin_tasks")
    .select("id, assigned_to, created_by, program_id, city, category, status, assigned_at, completed_at")
    .order("assigned_at", { ascending: false });
  if (filterAssignedTo) query = query.eq("assigned_to", filterAssignedTo);

  const { data: tasks, error } = await query;
  if (error) throw new Error(`No se pudieron consultar las tareas: ${error.message}`);
  if (!tasks || tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id as string);
  const userIds = [...new Set(tasks.flatMap((t) => [t.assigned_to as string, t.created_by as string]))];
  const programIds = [...new Set(tasks.map((t) => t.program_id as string))];

  const [{ data: users }, { data: programs }, { data: members }] = await Promise.all([
    supabase.from("admin_users").select("id, full_name").in("id", userIds),
    supabase.from("programs").select("id, name").in("id", programIds),
    supabase.from("admin_task_benefits").select("task_id, benefit_id").in("task_id", taskIds),
  ]);

  const nameById = new Map((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  const programNameById = new Map((programs ?? []).map((p) => [p.id as string, p.name as string]));

  const membersByTask = new Map<string, string[]>();
  for (const m of members ?? []) {
    const tId = m.task_id as string;
    if (!membersByTask.has(tId)) membersByTask.set(tId, []);
    membersByTask.get(tId)!.push(m.benefit_id as string);
  }
  const allMemberIds = [...new Set((members ?? []).map((m) => m.benefit_id as string))];
  const auditStatusByBenefit = await getAuditStatusBulk(allMemberIds);

  return tasks.map((t) => {
    const memberIds = membersByTask.get(t.id as string) ?? [];
    const auditedCount = memberIds.filter(
      (id) => auditStatusByBenefit.get(id)?.status === "auditado"
    ).length;
    return {
      id: t.id as string,
      assignedToId: t.assigned_to as string,
      assignedToName: nameById.get(t.assigned_to as string) ?? "",
      createdById: t.created_by as string,
      programId: t.program_id as string,
      programName: programNameById.get(t.program_id as string) ?? "",
      city: t.city as string,
      category: (t.category as string) ?? null,
      status: t.status as TaskStatus,
      assignedAt: t.assigned_at as string,
      completedAt: (t.completed_at as string) ?? null,
      totalCount: memberIds.length,
      auditedCount,
    };
  });
}

/** Todas las tareas (admin) - "en proceso"/"historico" ya vienen separables por status. */
export async function listTasksForAdmin(): Promise<AdminTaskSummary[]> {
  return loadTaskSummaries();
}

/** Solo las tareas de este analista (regla 11: nunca ve las de otros). */
export async function listTasksForAnalyst(analystId: string): Promise<AdminTaskSummary[]> {
  return loadTaskSummaries(analystId);
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const { data: task, error } = await supabase
    .from("admin_tasks")
    .select("id, assigned_to, created_by, program_id, city, category, status, assigned_at, completed_at")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo consultar la tarea: ${error.message}`);
  if (!task) return null;

  const { data: members, error: membersError } = await supabase
    .from("admin_task_benefits")
    .select("benefit_id")
    .eq("task_id", taskId);
  if (membersError) {
    throw new Error(`No se pudieron consultar los beneficios de la tarea: ${membersError.message}`);
  }
  const benefitIds = (members ?? []).map((m) => m.benefit_id as string);

  const [{ data: users }, { data: programs }] = await Promise.all([
    supabase.from("admin_users").select("id, full_name").in("id", [task.assigned_to, task.created_by]),
    supabase.from("programs").select("id, name").eq("id", task.program_id as string),
  ]);
  const nameById = new Map((users ?? []).map((u) => [u.id as string, u.full_name as string]));

  let benefitRows: {
    id: string;
    title: string;
    category: string | null;
    status: string;
    image_url: string | null;
    address: string | null;
  }[] = [];
  if (benefitIds.length > 0) {
    const { data, error: benefitsError } = await supabase
      .from("benefits")
      .select("id, title, category, status, image_url, address")
      .in("id", benefitIds);
    if (benefitsError) {
      throw new Error(`No se pudieron consultar los beneficios de la tarea: ${benefitsError.message}`);
    }
    benefitRows = data ?? [];
  }

  const auditStatusByBenefit = await getAuditStatusBulk(benefitIds);
  const auditedCount = benefitIds.filter(
    (id) => auditStatusByBenefit.get(id)?.status === "auditado"
  ).length;

  const benefits: TaskDetail["benefits"] = benefitRows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status as AdminBenefitCard["status"],
    imageUrl: r.image_url,
    siteBucket: estimateSiteBucket(r.address),
    auditStatus: auditStatusByBenefit.get(r.id)?.status ?? "sin_auditar",
  }));

  return {
    id: task.id as string,
    assignedToId: task.assigned_to as string,
    assignedToName: nameById.get(task.assigned_to as string) ?? "",
    createdById: task.created_by as string,
    programId: task.program_id as string,
    programName: (programs ?? [])[0]?.name as string ?? "",
    city: task.city as string,
    category: (task.category as string) ?? null,
    status: task.status as TaskStatus,
    assignedAt: task.assigned_at as string,
    completedAt: (task.completed_at as string) ?? null,
    totalCount: benefitIds.length,
    auditedCount,
    benefits,
  };
}
