import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { listAllCities, listAllPrograms } from "@/lib/admin/catalog";
import { listAllTasksAction, listMyTasksAction, listActiveAnalystsAction } from "../tasksActions";
import TasksBoard from "./TasksBoard";

export default async function TasksPage() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect("/admin/login");

  if (currentUser.role === "admin") {
    const [tasks, analysts, cities, programs] = await Promise.all([
      listAllTasksAction(),
      listActiveAnalystsAction(),
      listAllCities(),
      listAllPrograms(),
    ]);
    return (
      <TasksBoard
        isAdmin
        initialTasks={tasks}
        analysts={analysts}
        cities={cities}
        programs={programs}
      />
    );
  }

  const tasks = await listMyTasksAction();
  return <TasksBoard isAdmin={false} initialTasks={tasks} analysts={[]} cities={[]} programs={[]} />;
}
