"use client";

import { Fragment, useEffect, useState } from "react";
import type { PaymentRow, PaymentAnalystOption, PaymentBenefitDetail } from "@/lib/admin/payments";
import { listPaymentRowsAction, getPaymentTaskBenefitsAction } from "../pagosActions";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
}

function taskLabel(r: PaymentRow): string {
  return `${r.programName} · ${r.city}${r.category ? ` · ${r.category}` : ""}`;
}

function ComplianceBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div>
      <span className="text-xs font-semibold text-zinc-700">{clamped}%</span>
      <div className="mt-1 h-1.5 w-20 rounded-full bg-zinc-100">
        <div
          className="h-1.5 rounded-full bg-emerald-500 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function TaskDetailRows({ taskId }: { taskId: string }) {
  const [detail, setDetail] = useState<PaymentBenefitDetail[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPaymentTaskBenefitsAction(taskId)
      .then((rows) => {
        if (!cancelled) setDetail(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el detalle.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (loading) return <p className="p-3 text-xs text-zinc-400">Cargando detalle...</p>;
  if (error) return <p className="p-3 text-xs text-red-600">{error}</p>;
  if (!detail || detail.length === 0) {
    return <p className="p-3 text-xs text-zinc-400">Esta tarea no tiene beneficios.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-100 bg-zinc-50 text-xs">
      {detail.map((b) => (
        <li key={b.benefitId} className="flex items-center justify-between px-4 py-2">
          <span className="text-zinc-700">{b.title}</span>
          {b.auditedAt ? (
            <span className="text-emerald-700">Auditado · {formatDate(b.auditedAt)}</span>
          ) : (
            <span className="text-zinc-400">Por auditar</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PagosView({
  initialRows,
  analysts,
}: {
  initialRows: PaymentRow[];
  analysts: PaymentAnalystOption[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [analystId, setAnalystId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  async function applyFilters(next: { analystId: string; from: string; to: string }) {
    setLoading(true);
    setError(null);
    try {
      const fresh = await listPaymentRowsAction({
        analystId: next.analystId || undefined,
        from: next.from || undefined,
        to: next.to || undefined,
      });
      setRows(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los pagos.");
    } finally {
      setLoading(false);
    }
  }

  function handleAnalystChange(value: string) {
    setAnalystId(value);
    applyFilters({ analystId: value, from, to });
  }

  function handleFromChange(value: string) {
    setFrom(value);
    applyFilters({ analystId, from: value, to });
  }

  function handleToChange(value: string) {
    setTo(value);
    applyFilters({ analystId, from, to: value });
  }

  function handleClearRange() {
    setFrom("");
    setTo("");
    applyFilters({ analystId, from: "", to: "" });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.totalCount,
      auditedInRange: acc.auditedInRange + r.auditedInRange,
      pendingToday: acc.pendingToday + r.pendingToday,
    }),
    { total: 0, auditedInRange: 0, pendingToday: 0 }
  );
  const totalPct = totals.total > 0 ? (totals.auditedInRange / totals.total) * 100 : 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-lg font-bold text-zinc-900">Pagos</h1>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-zinc-500">Analista</span>
          <select
            value={analystId}
            onChange={(e) => handleAnalystChange(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5"
          >
            <option value="">Todos</option>
            {analysts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-zinc-500">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(e) => handleFromChange(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-zinc-500">Hasta</span>
          <input
            type="date"
            value={to}
            onChange={(e) => handleToChange(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5"
          />
        </label>
        {(from || to) && (
          <button
            onClick={handleClearRange}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Quitar rango
          </button>
        )}
        {loading && <span className="text-zinc-400">Actualizando...</span>}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">
          {from || to
            ? "No hay tareas con auditorías dentro de este rango."
            : "No hay tareas todavía."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Analista</th>
                <th className="px-3 py-2">Tarea</th>
                <th className="px-3 py-2">Inicio</th>
                <th className="px-3 py-2">Fin</th>
                <th className="px-3 py-2">Auditados</th>
                <th className="px-3 py-2">Por auditar</th>
                <th className="px-3 py-2">% cumplimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <Fragment key={r.taskId}>
                  <tr
                    onClick={() =>
                      setExpandedTaskId(expandedTaskId === r.taskId ? null : r.taskId)
                    }
                    className="cursor-pointer hover:bg-zinc-50"
                  >
                    <td className="px-3 py-2">{r.analystName}</td>
                    <td className="px-3 py-2">{taskLabel(r)}</td>
                    <td className="px-3 py-2">{formatDate(r.assignedAt)}</td>
                    <td className="px-3 py-2">{formatDate(r.lastAuditedAt)}</td>
                    <td className="px-3 py-2">{r.auditedInRange}</td>
                    <td className="px-3 py-2">{r.pendingToday}</td>
                    <td className="px-3 py-2">
                      <ComplianceBar pct={r.compliancePct} />
                    </td>
                  </tr>
                  {expandedTaskId === r.taskId && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <TaskDetailRows taskId={r.taskId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="border-t border-zinc-200 bg-zinc-50 font-semibold text-zinc-700">
              <tr>
                <td className="px-3 py-2" colSpan={4}>
                  Totales
                </td>
                <td className="px-3 py-2">{totals.auditedInRange}</td>
                <td className="px-3 py-2">{totals.pendingToday}</td>
                <td className="px-3 py-2">
                  <ComplianceBar pct={totalPct} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
