import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { getTaskDetailAction } from "../../tasksActions";
import TaskDetailView from "./TaskDetailView";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect("/admin/login");

  let detail;
  try {
    detail = await getTaskDetailAction(taskId);
  } catch {
    redirect("/admin/tasks");
  }
  if (!detail) redirect("/admin/tasks");

  return <TaskDetailView taskId={taskId} initialDetail={detail} />;
}
