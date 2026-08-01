"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminTaskSummary } from "@/lib/admin/tasks";
import type { AdminCityOption, AdminProgramOption } from "@/lib/admin/catalog";
import { createTaskAction, type AnalystOption } from "../tasksActions";
import { loadBenefitsAction } from "../catalogActions";

function firstCategory(category: string | null): string {
  return category?.split(",")[0]?.trim() ?? "";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO");
}

function taskLabel(t: AdminTaskSummary): string {
  return `${t.programName} · ${t.city}${t.category ? ` · ${t.category}` : ""}`;
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100">
      <div
        className="h-1.5 rounded-full bg-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TaskCard({ task }: { task: AdminTaskSummary }) {
  return (
    <Link
      href={`/admin/tasks/${task.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-3 text-sm hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-zinc-900">{taskLabel(task)}</span>
        <span className="text-xs text-zinc-400">{formatDate(task.assignedAt)}</span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {task.auditedCount} de {task.totalCount} auditados
      </p>
      <ProgressBar done={task.auditedCount} total={task.totalCount} />
    </Link>
  );
}

function CreateTaskForm({
  analysts,
  cities,
  programs,
  onCreated,
}: {
  analysts: AnalystOption[];
  cities: AdminCityOption[];
  programs: AdminProgramOption[];
  onCreated: () => void;
}) {
  const [city, setCity] = useState("");
  const [programId, setProgramId] = useState("");
  const [category, setCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categorias reales del alcance elegido (ciudad+benefactor) - nunca
  // texto libre, para evitar errores humanos al escribir (ej. "Salud" vs
  // "salud " con espacio) que dejarian la tarea vacia sin avisar.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setCategory("");
      if (!city || !programId) {
        setCategoryOptions([]);
        return;
      }
      setLoadingCategories(true);
      try {
        const rows = await loadBenefitsAction(programId, city);
        if (cancelled) return;
        const set = new Set(rows.map((r) => firstCategory(r.category)).filter(Boolean));
        setCategoryOptions([...set].sort());
      } catch {
        if (!cancelled) setCategoryOptions([]);
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    }
    run();

    return () => {
      cancelled = true;
    };
  }, [city, programId]);

  async function handleCreate() {
    if (!city || !programId || !assignedTo) return;
    setCreating(true);
    setError(null);
    try {
      await createTaskAction(programId, city, category || null, assignedTo);
      setCategory("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la tarea.");
    } finally {
      setCreating(false);
    }
  }

  if (analysts.length === 0) {
    return (
      <p className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-500">
        No hay analistas activos todavía — invita uno en{" "}
        <Link href="/admin/users" className="font-semibold text-mia-cyan">
          Usuarios
        </Link>{" "}
        antes de crear una tarea.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-xs">
      <span className="font-bold uppercase text-zinc-400">Crear tarea</span>
      {error && <p className="rounded-lg bg-red-50 p-2 text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5"
        >
          <option value="">Ciudad...</option>
          {cities.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5"
        >
          <option value="">Benefactor...</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={!city || !programId || loadingCategories}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 disabled:opacity-50"
        >
          <option value="">
            {loadingCategories ? "Cargando categorías..." : "Todas las categorías"}
          </option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5"
        >
          <option value="">Analista...</option>
          {analysts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={handleCreate}
        disabled={creating || !city || !programId || !assignedTo}
        className="rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
      >
        {creating ? "Creando..." : "Crear tarea"}
      </button>
    </div>
  );
}

export default function TasksBoard({
  isAdmin,
  initialTasks,
  analysts,
  cities,
  programs,
}: {
  isAdmin: boolean;
  initialTasks: AdminTaskSummary[];
  analysts: AnalystOption[];
  cities: AdminCityOption[];
  programs: AdminProgramOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"en_proceso" | "historico">("en_proceso");

  const enProceso = useMemo(
    () => initialTasks.filter((t) => t.status === "activa"),
    [initialTasks]
  );
  const historico = useMemo(
    () => initialTasks.filter((t) => t.status === "historico"),
    [initialTasks]
  );

  const enProcesoByAnalyst = useMemo(() => {
    const groups = new Map<string, AdminTaskSummary[]>();
    for (const t of enProceso) {
      const key = t.assignedToName || t.assignedToId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return groups;
  }, [enProceso]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-lg font-bold text-zinc-900">
        {isAdmin ? "Tareas" : "Mis tareas"}
      </h1>

      {isAdmin && (
        <div className="mb-6">
          <CreateTaskForm
            analysts={analysts}
            cities={cities}
            programs={programs}
            onCreated={() => router.refresh()}
          />
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        <button
          onClick={() => setTab("en_proceso")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "en_proceso"
              ? "border-b-2 border-zinc-900 text-zinc-900"
              : "text-zinc-400 hover:text-zinc-700"
          }`}
        >
          En proceso
        </button>
        <button
          onClick={() => setTab("historico")}
          className={`px-3 py-2 text-sm font-semibold ${
            tab === "historico"
              ? "border-b-2 border-zinc-900 text-zinc-900"
              : "text-zinc-400 hover:text-zinc-700"
          }`}
        >
          Histórico
        </button>
      </div>

      {tab === "en_proceso" &&
        (enProceso.length === 0 ? (
          <p className="text-sm text-zinc-400">No hay tareas en proceso.</p>
        ) : isAdmin ? (
          <div className="flex flex-col gap-4">
            {[...enProcesoByAnalyst.entries()].map(([analystName, tasks]) => (
              <div key={analystName}>
                <h2 className="mb-2 text-xs font-bold uppercase text-zinc-400">{analystName}</h2>
                <div className="flex flex-col gap-2">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {enProceso.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        ))}

      {tab === "historico" &&
        (historico.length === 0 ? (
          <p className="text-sm text-zinc-400">Todavía no hay tareas completadas.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  {isAdmin && <th className="px-3 py-2">Analista</th>}
                  <th className="px-3 py-2">Tarea</th>
                  <th className="px-3 py-2">Asignada</th>
                  <th className="px-3 py-2">Finalizada</th>
                  <th className="px-3 py-2">Auditorías</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {historico.map((t) => (
                  <tr key={t.id}>
                    {isAdmin && <td className="px-3 py-2">{t.assignedToName}</td>}
                    <td className="px-3 py-2">
                      <Link href={`/admin/tasks/${t.id}`} className="text-mia-cyan hover:underline">
                        {taskLabel(t)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{formatDate(t.assignedAt)}</td>
                    <td className="px-3 py-2">{formatDate(t.completedAt)}</td>
                    <td className="px-3 py-2">{t.auditedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
