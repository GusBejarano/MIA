"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaskDetail } from "@/lib/admin/tasks";
import type { AdminBenefitFull } from "@/lib/admin/catalog";
import { getTaskDetailAction } from "../../tasksActions";
import { loadBenefitFullAction } from "../../catalogActions";
import AdminBenefitGrid from "../../AdminBenefitGrid";
import EditPanel from "../../EditPanel";

function taskLabel(t: TaskDetail): string {
  return `${t.programName} · ${t.city}${t.category ? ` · ${t.category}` : ""}`;
}

export default function TaskDetailView({
  taskId,
  initialDetail,
}: {
  taskId: string;
  initialDetail: TaskDetail;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [selected, setSelected] = useState<AdminBenefitFull | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  async function refreshDetail() {
    const fresh = await getTaskDetailAction(taskId);
    if (fresh) setDetail(fresh);
  }

  async function handleSelectCard(id: string) {
    setPanelCollapsed(false);
    const full = await loadBenefitFullAction(id);
    setSelected(full);
  }

  function handleSaved(updated: AdminBenefitFull) {
    setSelected(updated);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-zinc-200 bg-white p-4">
        <Link href="/admin/tasks" className="text-xs text-zinc-400 hover:text-zinc-700">
          ← Volver a tareas
        </Link>
        <h1 className="mt-1 text-lg font-bold text-zinc-900">{taskLabel(detail)}</h1>
        <p className="text-sm text-zinc-500">
          {detail.auditedCount} de {detail.totalCount} auditados
          {detail.status === "historico" && (
            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Completada
            </span>
          )}
        </p>
      </div>

      <div className="flex-1 p-4">
        {detail.benefits.length === 0 ? (
          <p className="text-sm text-zinc-400">Esta tarea no tiene beneficios pendientes.</p>
        ) : (
          <AdminBenefitGrid
            cards={detail.benefits.map((b) => ({
              id: b.id,
              title: b.title,
              tag: b.category?.split(",")[0]?.trim() ?? "(sin categoría)",
              status: b.status,
              thumbUrl: b.imageUrl,
            }))}
            onSelect={handleSelectCard}
          />
        )}
      </div>

      {selected && panelCollapsed && (
        <button
          onClick={() => setPanelCollapsed(false)}
          className="fixed inset-y-0 right-0 z-40 flex w-10 flex-col items-center justify-center gap-2 border-l border-zinc-200 bg-white shadow-xl hover:bg-zinc-50"
          title="Mostrar detalle de beneficio"
        >
          <span className="text-lg">←</span>
        </button>
      )}

      {selected && !panelCollapsed && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-[26rem]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <button
              onClick={() => setPanelCollapsed(true)}
              className="text-lg text-zinc-400 hover:text-zinc-900"
              title="Minimizar"
            >
              →
            </button>
            <h2 className="text-sm font-bold text-zinc-900">Detalle de Beneficio</h2>
            <span className="w-4" />
          </div>
          <EditPanel
            key={selected.id}
            benefit={selected}
            city={detail.city}
            taskId={taskId}
            onSaved={handleSaved}
            onAudited={refreshDetail}
          />
        </div>
      )}
    </div>
  );
}
