"use server";

import { getCurrentAdminUser, type CurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { supabase } from "@/lib/mia/supabaseClient";
import {
  createTask,
  listTasksForAdmin,
  listTasksForAnalyst,
  getTaskDetail,
  type AdminTaskSummary,
  type TaskDetail,
} from "@/lib/admin/tasks";

async function requireAdminUser(): Promise<CurrentAdminUser> {
  const user = await getCurrentAdminUser();
  if (!user) throw new Error("No autenticado.");
  return user;
}

async function requireAdminRole(): Promise<CurrentAdminUser> {
  const user = await requireAdminUser();
  if (user.role !== "admin") throw new Error("No tienes permiso para esta acción.");
  return user;
}

/**
 * Re-chequeo real del lado del servidor (regla 14 de v2.1) - un analista
 * solo puede ver/tocar sus propias tareas, sin importar si manipula la
 * URL: esto no se puede hacer con RLS aqui (todo el proyecto usa el
 * cliente service_role, que ignora RLS siempre) - el chequeo vive en el
 * Server Action, mismo patron que requireAdminUser en catalogActions.ts.
 */
async function requireTaskAccess(taskId: string): Promise<CurrentAdminUser> {
  const user = await requireAdminUser();
  if (user.role === "admin") return user;

  const { data: task, error } = await supabase
    .from("admin_tasks")
    .select("assigned_to")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo verificar la tarea: ${error.message}`);
  if (!task || task.assigned_to !== user.id) {
    throw new Error("No tienes acceso a esta tarea.");
  }
  return user;
}

export async function createTaskAction(
  programId: string,
  city: string,
  category: string | null,
  assignedTo: string
): Promise<string> {
  const user = await requireAdminRole();
  return createTask(programId, city, category, assignedTo, user.id);
}

export async function listAllTasksAction(): Promise<AdminTaskSummary[]> {
  await requireAdminRole();
  return listTasksForAdmin();
}

/** Cualquier usuario autenticado - siempre acota a sus propias tareas
 * (regla 11: un analista nunca ve las de otros; un admin usando esta
 * vista tambien solo veria las suyas, que hoy no aplica porque los
 * admin no reciben tareas asignadas). */
export async function listMyTasksAction(): Promise<AdminTaskSummary[]> {
  const user = await requireAdminUser();
  return listTasksForAnalyst(user.id);
}

export async function getTaskDetailAction(taskId: string): Promise<TaskDetail | null> {
  await requireTaskAccess(taskId);
  return getTaskDetail(taskId);
}

export type AnalystOption = { id: string; fullName: string };

/** Analistas activos, para el selector de "Crear tarea" (admin only). */
export async function listActiveAnalystsAction(): Promise<AnalystOption[]> {
  await requireAdminRole();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name")
    .eq("role", "analista")
    .eq("is_active", true)
    .order("full_name");
  if (error) throw new Error(`No se pudieron consultar los analistas: ${error.message}`);
  return (data ?? []).map((u) => ({ id: u.id as string, fullName: u.full_name as string }));
}
